export function marcelle(node, component) {
	component.mount(node);

	return {
		update(component) {
			console.log(`the value of component '${component}' has changed`);
		},

		destroy() {
			// the node has been removed from the DOM
			component.destroy();
		}
	};
}
