import { genTemplateFn, CHANGE_TYPE } from '../../../lib/webcomponents';
import { LoadingSpinner } from "./loading-spinner";
import { html } from "lit-html";

export const LoadingSpinnerHTML = genTemplateFn<LoadingSpinner>(() => {
	return html`
		<div id="container" class="mdl-spinner mdl-js-spinner is-active"></div>
	`;
}, CHANGE_TYPE.NEVER);