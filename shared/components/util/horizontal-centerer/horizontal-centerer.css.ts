import { TemplateFn, CHANGE_TYPE } from '../../../lib/webcomponents';
import { HorizontalCenterer } from './horizontal-centerer';

export const HorizontalCentererCSS = new TemplateFn<HorizontalCenterer>((html) => {
	return html`<style>
		#container {
			display: flex;
			flex-direction: row;
			justify-content: center
		}

		#content {
			display: block;
		}
	</style>`
}, CHANGE_TYPE.NEVER);