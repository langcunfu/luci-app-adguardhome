'use strict';
'require view';
'require poll';
'require rpc';
'require view/adguardhome/status as status';

var callRuntimeLog = rpc.declare({
	object: 'luci.adguardhome',
	method: 'getRuntimeLog',
	params: [ 'offset', 'identity' ],
	expect: { '': {} },
	reject: true
});

var callClearRuntimeLog = rpc.declare({
	object: 'luci.adguardhome',
	method: 'clearRuntimeLog',
	expect: { '': {} },
	reject: true
});

function decodeLog(result) {
	var content = result.content || '';
	if (typeof result.content_b64 === 'string') {
		var binary = atob(result.content_b64);
		var bytes = new Uint8Array(binary.length);
		for (var i = 0; i < binary.length; i++)
			bytes[i] = binary.charCodeAt(i);
		content = new TextDecoder('utf-8').decode(bytes);
	}
	// Truncating an open log does not reset a non-append writer's file position.
	return content.replace(/\0/g, '');
}

function pad(value) {
	return value < 10 ? '0' + value : value;
}

function localizeTimestamps(content) {
	return content.split('\n').map(function(line) {
		var date = new Date(line.substring(0, 19).replace(/\//g, '-') + ' UTC');
		if (isNaN(date.getTime()))
			return line;

		return date.getFullYear() + '/' + pad(date.getMonth() + 1) + '/' + pad(date.getDate()) + ' ' +
			pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds()) + line.substring(19);
	}).join('\n');
}

return view.extend({
	handleSave: null,
	handleSaveApply: null,
	handleReset: null,

	load: function() {
		return callRuntimeLog(0, '').catch(function() {
			return { error: true, localtime: false, content: '', offset: 0 };
		});
	},

	render: function(initialLog) {
		var sharedStatus = status.render();
		var logLimit = 262144;
		var content = decodeLog(initialLog).slice(-logLimit);
		var identity = initialLog.identity || '';
		var generation = 0;
		var offset = initialLog.offset || 0;
		var enabled = initialLog.enabled;
		var localtime = initialLog.localtime;
		var reverse = true;
		var convertTime = localtime;
		var logArea = E('textarea', {
			'class': 'cbi-input-textarea',
			'rows': 32,
			'readonly': 'readonly',
			'style': 'width:100%;box-sizing:border-box;'
		});
		var toggleStyle = 'margin:0 0.35em 0 0;height:auto;flex:none;';
		var reverseToggle = E('input', { 'type': 'checkbox', 'checked': true, 'style': toggleStyle });
		var timeToggle = E('input', { 'type': 'checkbox', 'checked': true, 'style': toggleStyle });
		var reverseLabel = E('label', { 'style': 'display:inline-flex;align-items:center;' }, [
			reverseToggle, _('reverse')
		]);
		var timeLabel = E('label', { 'style': localtime ? 'display:inline-flex;align-items:center;margin-left:0.8em;' : 'display:none;' }, [
			timeToggle, _('localtime')
		]);
		var message = E('span', { 'style': 'margin-left:0.8em;' }, '');

		function renderLog() {
			var displayed = convertTime ? localizeTimestamps(content) : content;
			logArea.value = reverse ? displayed.split('\n').reverse().join('\n') : displayed;
		}

		function downloadLog() {
			var now = new Date();
			var link = document.createElement('a');
			link.download = 'AdGuardHome' + (now.getMonth() + 1) + '-' + now.getDate() + '-' +
				pad(now.getHours()) + '_' + pad(now.getMinutes()) + '.log';
			link.href = URL.createObjectURL(new Blob([logArea.value], { type: 'text/plain' }));
			link.click();
			URL.revokeObjectURL(link.href);
		}

		var clearButton = E('button', {
			'class': 'btn cbi-button cbi-button-apply', 'type': 'button'
		}, _('dellog'));
		var downloadButton = E('button', {
			'class': 'btn cbi-button', 'type': 'button', 'style': 'margin-left:0.6em;'
		}, _('download log'));
		reverseToggle.addEventListener('change', function() {
			reverse = reverseToggle.checked;
			renderLog();
		});
		timeToggle.addEventListener('change', function() {
			convertTime = timeToggle.checked;
			renderLog();
		});
		clearButton.addEventListener('click', function() {
			clearButton.disabled = true;
			generation++;
			callClearRuntimeLog().then(function(result) {
				if (!result.cleared)
					throw new Error(result.reason || 'clear failed');
				content = '';
				offset = 0;
				identity = '';
				generation++;
				message.textContent = '';
				renderLog();
			}).catch(function() {
				message.textContent = _('Status unavailable');
			}).then(function() {
				clearButton.disabled = false;
			});
		});
		downloadButton.addEventListener('click', downloadLog);

		var page = E('div', { 'class': 'cbi-map' }, [
			sharedStatus.node,
			logArea,
			E('div', { 'style': 'display:flex;align-items:center;padding:0.6em;' }, [
				reverseLabel, timeLabel
			]),
			E('div', { 'style': 'padding:0 0.6em 0.6em;' }, [clearButton, downloadButton, message])
		]);

		if (initialLog.error)
			message.textContent = _('Unable to read runtime log');
		else if (!enabled)
			message.textContent = _('Please add log path in config to enable log');
		renderLog();

		poll.add(function() {
			if (clearButton.disabled)
				return Promise.resolve();
			var requestGeneration = generation;
			return callRuntimeLog(offset, identity).then(function(result) {
				if (requestGeneration !== generation)
					return;
				enabled = result.enabled;
				if (!enabled) {
					message.textContent = _('Please add log path in config to enable log');
					return;
				}
				message.textContent = '';
				if (result.reset || result.offset < offset)
					content = '';
				offset = result.offset;
				identity = result.identity || '';
				content = (content + decodeLog(result)).slice(-logLimit);
				renderLog();
			}).catch(function() {
				message.textContent = _('Status unavailable');
			});
		}, 3);

		return page;
	}
});