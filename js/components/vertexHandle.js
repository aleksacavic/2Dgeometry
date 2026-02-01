// Vertex Handle Component
// Provides draggable vertex points for shape editing

export class VertexHandle {
    constructor(coordSystem, group, config = {}) {
        this.coordSystem = coordSystem;
        this.group = group;
        this.id = config.id || `vertex-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        this.x = config.x || 0;
        this.y = config.y || 0;
        this.radius = config.radius || 6;
        this.color = config.color || '#2196F3';
        this.activeColor = config.activeColor || '#FF5722';

        this.onDrag = config.onDrag || (() => {});
        this.onDragEnd = config.onDragEnd || (() => {});
        this.onClick = config.onClick || (() => {});

        this.isDragging = false;
        this.element = null;

        this.render();
    }

    render() {
        if (this.element) {
            this.element.remove();
        }

        const pixel = this.coordSystem.toPixel(this.x, this.y);

        this.element = this.group.append('g')
            .attr('class', 'vertex-handle')
            .attr('data-id', this.id)
            .attr('transform', `translate(${pixel.x}, ${pixel.y})`)
            .style('cursor', 'move');

        // Outer circle (hit area)
        this.element.append('circle')
            .attr('class', 'vertex-hit-area')
            .attr('r', this.radius + 4)
            .attr('fill', 'transparent');

        // Visible circle
        this.circle = this.element.append('circle')
            .attr('class', 'vertex-point')
            .attr('r', this.radius)
            .attr('fill', this.color)
            .attr('stroke', '#fff')
            .attr('stroke-width', 2);

        // Setup drag behavior
        const drag = d3.drag()
            .on('start', (event) => this.handleDragStart(event))
            .on('drag', (event) => this.handleDrag(event))
            .on('end', (event) => this.handleDragEnd(event));

        this.element.call(drag);

        // Click handler
        this.element.on('click', (event) => {
            event.stopPropagation();
            this.onClick(this);
        });
    }

    handleDragStart(event) {
        this.isDragging = true;
        this.circle.attr('fill', this.activeColor);
        event.sourceEvent.stopPropagation();
    }

    handleDrag(event) {
        const world = this.coordSystem.toWorld(event.x, event.y);
        this.x = world.x;
        this.y = world.y;

        const pixel = this.coordSystem.toPixel(this.x, this.y);
        this.element.attr('transform', `translate(${pixel.x}, ${pixel.y})`);

        this.onDrag(this, { x: this.x, y: this.y });
    }

    handleDragEnd(event) {
        this.isDragging = false;
        this.circle.attr('fill', this.color);
        this.onDragEnd(this, { x: this.x, y: this.y });
    }

    setPosition(x, y) {
        this.x = x;
        this.y = y;
        const pixel = this.coordSystem.toPixel(this.x, this.y);
        this.element.attr('transform', `translate(${pixel.x}, ${pixel.y})`);
    }

    setColor(color) {
        this.color = color;
        if (!this.isDragging) {
            this.circle.attr('fill', color);
        }
    }

    setVisible(visible) {
        this.element.style('display', visible ? 'block' : 'none');
    }

    destroy() {
        if (this.element) {
            this.element.remove();
        }
    }
}

// Vertex Handle Manager - manages a set of handles for a shape
export class VertexHandleManager {
    constructor(coordSystem, group) {
        this.coordSystem = coordSystem;
        this.group = group.append('g').attr('class', 'vertex-handles');
        this.handles = [];
        this.visible = false;
    }

    setVertices(vertices, onUpdate) {
        // Clear existing handles
        this.clear();

        // Create new handles
        vertices.forEach((v, index) => {
            const handle = new VertexHandle(this.coordSystem, this.group, {
                x: v.x,
                y: v.y,
                id: `vertex-${index}`,
                onDrag: (handle, pos) => {
                    onUpdate(index, pos);
                },
                onDragEnd: (handle, pos) => {
                    onUpdate(index, pos, true);
                }
            });
            this.handles.push(handle);
        });

        this.setVisible(this.visible);
    }

    updatePositions(vertices) {
        vertices.forEach((v, index) => {
            if (this.handles[index]) {
                this.handles[index].setPosition(v.x, v.y);
            }
        });
    }

    setVisible(visible) {
        this.visible = visible;
        this.handles.forEach(h => h.setVisible(visible));
    }

    clear() {
        this.handles.forEach(h => h.destroy());
        this.handles = [];
    }

    destroy() {
        this.clear();
        this.group.remove();
    }
}
