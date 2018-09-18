import { TemplateFn, CHANGE_TYPE } from '../../../lib/webcomponents';
import { inlineListener } from '../../../lib/webcomponent-util';
import { InfiniteList } from './infinite-list';
import { html } from 'lit-html';

export const InfiniteListHTML = new TemplateFn<InfiniteList<any, any, any>>(function () {
	return html`
		<slot name="template" id="template" class="hidden"></slot>
		<div id="sizeGetter" class="hidden"></div>
		<div id="focusCapturer" tabIndex="-1"
			on-keydown="${inlineListener(this.focusCapturerKeydown, this)}"
		></div>
		<div id="contentContainer"
			on-keypress="${inlineListener(this.contentContainerKeyPress, this)}"
		>
			<div id="physicalContent"></div>
		</div>
	`;
}, CHANGE_TYPE.NEVER);