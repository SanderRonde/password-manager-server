import { TemplateFn, CHANGE_TYPE } from '../../../../lib/webcomponents';
import { changeOpacity } from '../../../../lib/webcomponent-util';
import { PasswordForm } from './password-form';
import { html } from 'lit-html';

export const PasswordFormCSS = new TemplateFn<PasswordForm>((_props, theme) => {
	return html`<style>
		.passwordWebsite {
			padding: 10px;
			display: flex;
			flex-direction: row;
			justify-content: space-between;
			border-radius: 5px;
			margin-bottom: 10px;
			background-color: ${changeOpacity(theme.accent.main, 5)};
			border: 1px solid ${theme.accent.main};
		}

		.passwordWebsiteRemoveCenterer {
			display: flex;
			flex-direction: column;
			justify-content: center;
			margin-left: 20px;
		}

		#addWebsiteCenterer {
			display: flex;
			flex-direction: row;
			justify-content: flex-end;
			margin-top: 10px;
		}

		#passwordSettingsLayout {
			display: flex;
			flex-direction: row;
			justify-content: space-around;
		}

		#passwordButtons {
			display: flex;
			flex-direction: row;
			justify-content: space-between;
			margin-top: 40px;
		}

		material-input .copy {
			display: inline-block;
		}

		material-input .copyDone {
			display: none;
		}

		material-input.done .copy {
			display: none;
		}

		material-input.done .copyDone {
			display: inline-block;
		}

		#deleteButtonIcon {
			margin-bottom: -5px;
			margin-top: 5px;
		}

		.hidden {
			display: none!important;
		}
	</style>`;
}, CHANGE_TYPE.THEME);