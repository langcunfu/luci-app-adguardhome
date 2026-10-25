'use strict';
'require view';
'require rpc';
'require view/adguardhome/status as status';

var callManualConfig = rpc.declare({
	object: 'luci.adguardhome',
	method: 'getManualConfig',
	expect: { '': {} },
	reject: true
});

var callSetManualConfig = rpc.declare({
	object: 'luci.adguardhome',
	method: 'setManualConfig',
	params: [ 'content' ],
	expect: { '': {} },
	reject: true
});

var callChangeWebPassword = rpc.declare({
	object: 'luci.adguardhome',
	method: 'changeWebPassword',
	params: [ 'hash' ],
	expect: { '': {} },
	reject: true
});

var codeMirrorLoader;
var bcryptLoader;

function loadBcrypt() {
	if (window.TwinBcrypt)
		return Promise.resolve(window.TwinBcrypt);

	if (!bcryptLoader) {
		bcryptLoader = new Promise(function(resolve, reject) {
			var script = document.createElement('script');
			script.src = L.resource('twin-bcrypt.min.js');
			script.onload = function() {
				if (window.TwinBcrypt)
					resolve(window.TwinBcrypt);
				else
					reject(new Error('bcrypt unavailable'));
			};
			script.onerror = reject;
			document.head.appendChild(script);
		}).catch(function(error) {
			bcryptLoader = null;
			throw error;
		});
	}

	return bcryptLoader;
}

function loadCodeMirror() {
	if (window.CodeMirror)
		return Promise.resolve(window.CodeMirror);
	if (!codeMirrorLoader) {
		codeMirrorLoader = new Promise(function(resolve, reject) {
			var stylesheet = document.createElement('link');
			stylesheet.rel = 'stylesheet';
			stylesheet.href = L.resource('codemirror/lib/codemirror.css');
			document.head.appendChild(stylesheet);
			var theme = document.createElement('link');
			theme.rel = 'stylesheet';
			theme.href = L.resource('codemirror/theme/dracula.css');
			document.head.appendChild(theme);
			var script = document.createElement('script');
			script.src = L.resource('codemirror/lib/codemirror.js');
			script.onload = function() {
				var yaml = document.createElement('script');
				yaml.src = L.resource('codemirror/mode/yaml/yaml.js');
				yaml.onload = function() { resolve(window.CodeMirror); };
				yaml.onerror = reject;
				document.head.appendChild(yaml);
			};
			script.onerror = reject;
			document.head.appendChild(script);
		});
	}
	return codeMirrorLoader;
}

return view.extend({
	handleSave: null,
	handleSaveApply: null,
	handleReset: null,

	load: function() {
		return callManualConfig().catch(function() {
			return { content: '', template: '', source: 'error' };
		});
	},

	render: function(initial) {
		var sharedStatus = status.render();
		var config = initial;
		var showingTemplate = false;
		var editor;
		var message = E('span', { 'style': 'margin-left:0.8em;' }, '');
		var configArea = E('textarea', {
			'class': 'cbi-input-textarea',
			'rows': 20,
			'wrap': 'off',
			'style': 'width:100%;box-sizing:border-box;font-family:monospace;'
		});
		var editorWrap = E('div', { 'class': 'agh-editor-wrap' }, configArea);
		var templateButton = E('button', {
			'class': 'btn cbi-button', 'type': 'button'
		}, _('Use template'));
		var reloadButton = E('button', {
			'class': 'btn cbi-button', 'type': 'button', 'style': 'margin-left:0.6em;'
		}, _('Reload Config'));
		var saveButton = E('button', {
			'class': 'btn cbi-button cbi-button-apply', 'type': 'button', 'style': 'margin-left:0.6em;'
		}, _('Save & Apply'));
		var passwordInput = E('input', {
			'class': 'cbi-input-password', 'type': 'password',
			'id': 'agh-web-password', 'autocomplete': 'new-password', 'spellcheck': 'false'
		});
		var passwordButton = E('button', {
			'class': 'btn cbi-button cbi-button-apply', 'type': 'button'
		}, _('Change password'));
		var passwordMessage = E('span', { 'style': 'margin-left:0.8em;' }, '');
		var passwordPanel = E('div', { 'class': 'agh-toolbar agh-password-controls' }, [
			E('label', { 'for': 'agh-web-password' }, _('Change browser management password')),
			passwordInput, passwordButton, passwordMessage
		]);

		function showConfig() {
			var content = showingTemplate ? config.template : config.content;
			if (editor)
				editor.setValue(content);
			else
				configArea.value = content;
			templateButton.disabled = !config.template;
		}

		templateButton.addEventListener('click', function() {
			showingTemplate = true;
			message.textContent = '';
			showConfig();
		});
		reloadButton.addEventListener('click', function() {
			reloadButton.disabled = true;
			message.textContent = '';
			callManualConfig().then(function(result) {
				config = result;
				showingTemplate = false;
				showConfig();
			}).catch(function() {
				message.textContent = _('Unable to read config');
			}).then(function() {
				reloadButton.disabled = false;
			});
		});
		saveButton.addEventListener('click', function() {
			var content = editor ? editor.getValue() : configArea.value;
			saveButton.disabled = true;
			message.textContent = _('Saving...');
			callSetManualConfig(content).then(function(result) {
				if (!result.saved)
					throw new Error(result.log || result.reason || 'save failed');
				config.content = content;
				config.source = 'current';
				showingTemplate = false;
				message.textContent = _('Saved');
			}).catch(function(error) {
				message.textContent = error.message || _('Save failed');
			}).then(function() {
				saveButton.disabled = false;
			});
		});
		passwordButton.addEventListener('click', function() {
			var password = passwordInput.value;
			if (!password) {
				passwordMessage.textContent = _('New password') + ' ' + _('is empty');
				return;
			}

			passwordButton.disabled = true;
			passwordMessage.textContent = _('Changing password...');
			loadBcrypt().then(function(bcrypt) {
				var hash = bcrypt.hashSync(password);
				password = null;
				passwordInput.value = '';
				return callChangeWebPassword(hash);
			}).then(function(result) {
				if (!result.changed)
					throw new Error(result.reason || 'change failed');
				passwordMessage.textContent = _('Password changed');
			}).catch(function() {
				passwordMessage.textContent = _('Password change failed');
			}).then(function() {
				passwordButton.disabled = false;
			});
		});
		showConfig();

		var page = E('div', {}, [
			E('link', { 'rel': 'stylesheet', 'href': L.resource('view/adguardhome/compact.css') }),
			sharedStatus.node,
			E('div', { 'class': 'cbi-section agh-compact-card agh-manual-card' }, [
				editorWrap,
				E('div', { 'class': 'agh-manual-toolbar' }, [
					passwordPanel,
					E('div', { 'class': 'agh-toolbar agh-config-actions' }, [message, templateButton, reloadButton, saveButton])
				])
			])
		]);
		loadCodeMirror().then(function(CodeMirror) {
			editor = CodeMirror.fromTextArea(configArea, {
				mode: 'text/yaml',
				lineNumbers: true,
				theme: 'dracula',
				lineWrapping: true,
				matchBrackets: true
			});
			editor.getWrapperElement().style.fontSize = '15px';
			editor.getWrapperElement().style.lineHeight = '1.5';
			// Twenty lines at 1.5em, plus CodeMirror's vertical content padding.
			editor.setSize(null, 'calc(30em + 8px)');
			editor.refresh();
			showConfig();
		}).catch(function() {
			message.textContent = _('Unable to load editor');
		});
		return page;
	}
});
