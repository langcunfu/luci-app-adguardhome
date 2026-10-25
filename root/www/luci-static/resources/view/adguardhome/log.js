'use strict';
'require view';
'require form';
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

var callSetVerboseLog = rpc.declare({
	object: 'luci.adguardhome',
	method: 'setVerboseLog',
	params: [ 'enabled' ],
	expect: { '': {} },
	reject: true,
	timeout: 45000
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
	load: function() {
		return callRuntimeLog(0, '').catch(function() {
			return { error: true, localtime: false, content: '', offset: 0 };
		});
	},

	render: function(initialLog) {
		var m = new form.Map('AdGuardHome');
		var s = m.section(form.TypedSection, 'AdGuardHome');
		s.anonymous = true;
		s.addremove = false;
		var o;

		o = s.option(
			form.Value,
			'logfile',
			_('Runtime log file')
		);
		o.rmempty = true;

		return m.render().then(function(settingsNode) {
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
				'rows': 16,
				'readonly': 'readonly',
				'style': 'width:100%;box-sizing:border-box;'
			});
			var toggleStyle = 'margin:0 0.35em 0 0;height:auto;flex:none;';
			var reverseToggle = E('input', { 'type': 'checkbox', 'checked': true, 'style': toggleStyle });
			var timeToggle = E('input', { 'type': 'checkbox', 'checked': true, 'style': toggleStyle });
			var reverseLabel = E('label', { 'style': 'display:inline-flex;align-items:center;' }, [
				reverseToggle, _('reverse')
			]);
			var timeLabel = E('label', { 'style': localtime ? 'display:inline-flex;align-items:center;' : 'display:none;' }, [
				timeToggle, _('localtime')
			]);
			var verboseToggle = E('input', {
				'type': 'checkbox', 'style': toggleStyle
			});
			// Boolean HTML attributes are true whenever present, even with a false value.
			verboseToggle.checked = m.data.get('AdGuardHome', 'AdGuardHome', 'verbose') === '1';
			verboseToggle.disabled = !!m.readonly;
			var verboseMessage = E('span', { 'role': 'status' }, '');
			var verboseLabel = E('label', { 'style': 'display:inline-flex;align-items:center;' }, [
				verboseToggle, _('Verbose log')
			]);
			verboseToggle.addEventListener('change', function() {
				var requested = verboseToggle.checked;
				verboseToggle.disabled = true;
				verboseMessage.textContent = _('Applying verbose logging…');
				callSetVerboseLog(requested).then(function(result) {
					if (!result.saved)
						throw new Error('save failed');
					verboseMessage.textContent = result.applied ? '' : _('Saved, but service reload failed; check the log');
				}).catch(function() {
					verboseToggle.checked = !requested;
					verboseMessage.textContent = _('Unable to apply verbose logging');
				}).then(function() {
					verboseToggle.disabled = false;
				});
			});
			var message = E('span', {}, '');

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
				'class': 'btn cbi-button', 'type': 'button'
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

			var settingsCard = settingsNode.querySelector('.cbi-section');
			settingsCard.classList.add('agh-compact-card', 'agh-log-view');
			var settingsFields = settingsCard.querySelector('.cbi-section-node');
			var logFileField = settingsFields.querySelector('.cbi-value');
			var logPath = logFileField.querySelector('input[type="text"]');
			if (logPath)
				logPath.title = _('If set to "syslog", write to system log; if empty, disable file logging');
			var logControls = E('div', { 'class': 'agh-log-controls' }, [
				E('div', { 'class': 'agh-toolbar agh-log-toggles' }, [
					reverseLabel, timeLabel, verboseLabel, verboseMessage, message
				]),
				E('div', { 'class': 'agh-log-actions' }, [
					E('div', { 'class': 'agh-toolbar' }, [clearButton, downloadButton]),
					logFileField
				])
			]);
			// Keep the form field inside its map, outside the theme's section layout.
			settingsFields.hidden = true;
			settingsCard.insertBefore(logControls, settingsFields);
			settingsCard.insertBefore(logArea, logControls);
			var page = E('div', {}, [
				E('link', { 'rel': 'stylesheet', 'href': L.resource('view/adguardhome/compact.css') }),
				sharedStatus.node,
				settingsNode
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
		});
	}
});