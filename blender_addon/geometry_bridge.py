# Blender WebSocket Addon for 2D Geometry Cross-Section Viewer
# This addon creates a WebSocket server that exposes mesh data and cross-sections

bl_info = {
    "name": "2D Geometry Bridge",
    "author": "RetainingWall Designer",
    "version": (1, 0, 0),
    "blender": (3, 0, 0),
    "location": "View3D > Sidebar > 2D Bridge",
    "description": "WebSocket bridge to 2D cross-section viewer",
    "category": "Import-Export",
}

import bpy
import bmesh
import json
import threading
import asyncio
import math
from mathutils import Vector, Matrix
from bpy.props import StringProperty, IntProperty, FloatProperty, BoolProperty, FloatVectorProperty

# Try to import websockets, provide instructions if not available
try:
    import websockets
    WEBSOCKETS_AVAILABLE = True
except ImportError:
    WEBSOCKETS_AVAILABLE = False
    print("websockets module not found. Install with: pip install websockets")


class CrossSectionCalculator:
    """Calculates cross-sections of meshes at specified planes"""

    @staticmethod
    def get_cross_section(obj, plane_point, plane_normal):
        """
        Get the cross-section of a mesh object at a given plane.

        Args:
            obj: Blender mesh object
            plane_point: Point on the cutting plane (Vector)
            plane_normal: Normal of the cutting plane (Vector)

        Returns:
            List of polylines (each polyline is a list of 2D points)
        """
        if obj.type != 'MESH':
            return []

        # Get world matrix
        world_matrix = obj.matrix_world

        # Create bmesh from object
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.transform(world_matrix)

        # Normalize plane normal
        plane_normal = plane_normal.normalized()

        # Find all edge intersections with the plane
        intersection_points = []
        edge_intersections = {}

        for edge in bm.edges:
            v1 = edge.verts[0].co
            v2 = edge.verts[1].co

            # Calculate signed distances from plane
            d1 = (v1 - plane_point).dot(plane_normal)
            d2 = (v2 - plane_point).dot(plane_normal)

            # Check if edge crosses the plane
            if d1 * d2 < 0:  # Different signs = crossing
                # Calculate intersection point
                t = d1 / (d1 - d2)
                intersection = v1 + t * (v2 - v1)

                # Store intersection with edge reference
                edge_intersections[edge.index] = intersection

        bm.free()

        if not edge_intersections:
            return []

        # Convert 3D points to 2D (project onto plane)
        # Create local 2D coordinate system on the plane
        # Use world X and Z for the 2D axes (assuming Y is typically depth)
        points_2d = []
        for idx, point in edge_intersections.items():
            # Project point onto plane's local coordinates
            local = point - plane_point

            # For XZ plane (Y = constant), use X and Z
            if abs(plane_normal.y) > 0.9:
                x_2d = local.x
                y_2d = local.z
            # For XY plane (Z = constant), use X and Y
            elif abs(plane_normal.z) > 0.9:
                x_2d = local.x
                y_2d = local.y
            # For YZ plane (X = constant), use Y and Z
            else:
                x_2d = local.y
                y_2d = local.z

            points_2d.append({'x': x_2d, 'y': y_2d})

        return points_2d

    @staticmethod
    def get_mesh_volume(obj):
        """Calculate the volume of a mesh object"""
        if obj.type != 'MESH':
            return 0

        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.transform(obj.matrix_world)

        volume = bm.calc_volume()
        bm.free()

        return volume

    @staticmethod
    def get_mesh_bounds(obj):
        """Get bounding box of mesh in world coordinates"""
        if obj.type != 'MESH':
            return None

        bbox_corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]

        min_x = min(c.x for c in bbox_corners)
        max_x = max(c.x for c in bbox_corners)
        min_y = min(c.y for c in bbox_corners)
        max_y = max(c.y for c in bbox_corners)
        min_z = min(c.z for c in bbox_corners)
        max_z = max(c.z for c in bbox_corners)

        return {
            'min': {'x': min_x, 'y': min_y, 'z': min_z},
            'max': {'x': max_x, 'y': max_y, 'z': max_z},
            'center': {
                'x': (min_x + max_x) / 2,
                'y': (min_y + max_y) / 2,
                'z': (min_z + max_z) / 2
            },
            'size': {
                'x': max_x - min_x,
                'y': max_y - min_y,
                'z': max_z - min_z
            }
        }

    @staticmethod
    def get_cross_section_polygon(obj, plane_point, plane_normal):
        """
        Get ordered polygon vertices for cross-section.
        Returns vertices in order suitable for drawing a closed polygon.
        """
        if obj.type != 'MESH':
            return []

        world_matrix = obj.matrix_world
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.transform(world_matrix)

        plane_normal = plane_normal.normalized()

        # Find face intersections
        face_segments = []

        for face in bm.faces:
            segment_points = []

            for edge in face.edges:
                v1 = edge.verts[0].co
                v2 = edge.verts[1].co

                d1 = (v1 - plane_point).dot(plane_normal)
                d2 = (v2 - plane_point).dot(plane_normal)

                if d1 * d2 < 0:
                    t = d1 / (d1 - d2)
                    intersection = v1 + t * (v2 - v1)
                    segment_points.append(intersection)

            if len(segment_points) == 2:
                face_segments.append(segment_points)

        bm.free()

        if not face_segments:
            return []

        # Connect segments into polygons
        polygons = []
        used = [False] * len(face_segments)

        while not all(used):
            # Find first unused segment
            start_idx = next(i for i, u in enumerate(used) if not u)
            used[start_idx] = True

            polygon = [face_segments[start_idx][0], face_segments[start_idx][1]]

            # Keep connecting segments
            changed = True
            while changed:
                changed = False
                for i, seg in enumerate(face_segments):
                    if used[i]:
                        continue

                    # Check if segment connects to polygon end
                    end = polygon[-1]
                    tolerance = 0.0001

                    if (seg[0] - end).length < tolerance:
                        polygon.append(seg[1])
                        used[i] = True
                        changed = True
                    elif (seg[1] - end).length < tolerance:
                        polygon.append(seg[0])
                        used[i] = True
                        changed = True

            # Convert to 2D
            polygon_2d = []
            for point in polygon:
                local = point - plane_point

                if abs(plane_normal.y) > 0.9:
                    x_2d = local.x
                    y_2d = local.z
                elif abs(plane_normal.z) > 0.9:
                    x_2d = local.x
                    y_2d = local.y
                else:
                    x_2d = local.y
                    y_2d = local.z

                polygon_2d.append({'x': round(x_2d, 4), 'y': round(y_2d, 4)})

            if len(polygon_2d) >= 3:
                polygons.append(polygon_2d)

        return polygons


class WebSocketServer:
    """WebSocket server for communicating with the web app"""

    def __init__(self, host='localhost', port=8765):
        self.host = host
        self.port = port
        self.server = None
        self.loop = None
        self.thread = None
        self.clients = set()
        self.running = False
        self.calculator = CrossSectionCalculator()

    async def handler(self, websocket, path):
        """Handle WebSocket connections"""
        self.clients.add(websocket)
        print(f"Client connected. Total clients: {len(self.clients)}")

        try:
            async for message in websocket:
                response = await self.process_message(message)
                if response:
                    await websocket.send(json.dumps(response))
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.discard(websocket)
            print(f"Client disconnected. Total clients: {len(self.clients)}")

    async def process_message(self, message):
        """Process incoming messages and return response"""
        try:
            data = json.loads(message)
            action = data.get('action')

            if action == 'ping':
                return {'status': 'pong'}

            elif action == 'get_objects':
                return self.get_objects_list()

            elif action == 'get_cross_section':
                obj_name = data.get('object')
                plane_y = data.get('plane_y', 0)
                plane_normal = data.get('plane_normal', 'Y')
                return self.get_cross_section(obj_name, plane_y, plane_normal)

            elif action == 'get_volume':
                obj_name = data.get('object')
                return self.get_volume(obj_name)

            elif action == 'get_bounds':
                obj_name = data.get('object')
                return self.get_bounds(obj_name)

            elif action == 'get_selected':
                return self.get_selected_object_data()

            elif action == 'update_vertices':
                obj_name = data.get('object')
                vertices = data.get('vertices', [])
                return self.update_vertices(obj_name, vertices)

            else:
                return {'error': f'Unknown action: {action}'}

        except json.JSONDecodeError:
            return {'error': 'Invalid JSON'}
        except Exception as e:
            return {'error': str(e)}

    def get_objects_list(self):
        """Get list of mesh objects in scene"""
        objects = []
        for obj in bpy.context.scene.objects:
            if obj.type == 'MESH':
                bounds = self.calculator.get_mesh_bounds(obj)
                objects.append({
                    'name': obj.name,
                    'type': obj.type,
                    'bounds': bounds,
                    'visible': obj.visible_get()
                })
        return {'objects': objects}

    def get_cross_section(self, obj_name, plane_y, plane_normal_axis):
        """Get cross-section of specified object"""
        obj = bpy.data.objects.get(obj_name)
        if not obj:
            return {'error': f'Object not found: {obj_name}'}

        # Determine plane normal and point
        if plane_normal_axis == 'X':
            plane_normal = Vector((1, 0, 0))
            plane_point = Vector((plane_y, 0, 0))
        elif plane_normal_axis == 'Y':
            plane_normal = Vector((0, 1, 0))
            plane_point = Vector((0, plane_y, 0))
        else:  # Z
            plane_normal = Vector((0, 0, 1))
            plane_point = Vector((0, 0, plane_y))

        polygons = self.calculator.get_cross_section_polygon(obj, plane_point, plane_normal)

        return {
            'object': obj_name,
            'plane_position': plane_y,
            'plane_normal': plane_normal_axis,
            'polygons': polygons
        }

    def get_volume(self, obj_name):
        """Get volume of specified object"""
        obj = bpy.data.objects.get(obj_name)
        if not obj:
            return {'error': f'Object not found: {obj_name}'}

        volume = self.calculator.get_mesh_volume(obj)
        return {'object': obj_name, 'volume': volume}

    def get_bounds(self, obj_name):
        """Get bounding box of specified object"""
        obj = bpy.data.objects.get(obj_name)
        if not obj:
            return {'error': f'Object not found: {obj_name}'}

        bounds = self.calculator.get_mesh_bounds(obj)
        return {'object': obj_name, 'bounds': bounds}

    def get_selected_object_data(self):
        """Get data for currently selected object"""
        obj = bpy.context.active_object
        if not obj or obj.type != 'MESH':
            return {'error': 'No mesh object selected'}

        bounds = self.calculator.get_mesh_bounds(obj)
        volume = self.calculator.get_mesh_volume(obj)

        # Get default cross-section at Y=0
        plane_point = Vector((0, 0, 0))
        plane_normal = Vector((0, 1, 0))
        polygons = self.calculator.get_cross_section_polygon(obj, plane_point, plane_normal)

        return {
            'object': obj.name,
            'bounds': bounds,
            'volume': volume,
            'cross_section': polygons
        }

    def update_vertices(self, obj_name, vertices_2d):
        """Update mesh vertices from 2D cross-section changes"""
        # This would need more sophisticated logic to map 2D changes back to 3D
        # For now, just acknowledge the request
        return {'status': 'received', 'object': obj_name, 'vertices_count': len(vertices_2d)}

    async def broadcast(self, message):
        """Send message to all connected clients"""
        if self.clients:
            await asyncio.gather(
                *[client.send(json.dumps(message)) for client in self.clients]
            )

    def start(self):
        """Start the WebSocket server in a background thread"""
        if self.running:
            return

        self.running = True
        self.loop = asyncio.new_event_loop()

        def run_server():
            asyncio.set_event_loop(self.loop)
            self.server = self.loop.run_until_complete(
                websockets.serve(self.handler, self.host, self.port)
            )
            print(f"WebSocket server started on ws://{self.host}:{self.port}")
            self.loop.run_forever()

        self.thread = threading.Thread(target=run_server, daemon=True)
        self.thread.start()

    def stop(self):
        """Stop the WebSocket server"""
        if not self.running:
            return

        self.running = False
        if self.server:
            self.server.close()
        if self.loop:
            self.loop.call_soon_threadsafe(self.loop.stop)
        print("WebSocket server stopped")


# Global server instance
ws_server = None


class GEOMETRY2D_OT_start_server(bpy.types.Operator):
    """Start the WebSocket server"""
    bl_idname = "geometry2d.start_server"
    bl_label = "Start Server"

    def execute(self, context):
        global ws_server

        if not WEBSOCKETS_AVAILABLE:
            self.report({'ERROR'}, "websockets module not installed. Run: pip install websockets")
            return {'CANCELLED'}

        if ws_server and ws_server.running:
            self.report({'WARNING'}, "Server already running")
            return {'CANCELLED'}

        props = context.scene.geometry2d_props
        ws_server = WebSocketServer(host=props.server_host, port=props.server_port)
        ws_server.start()

        self.report({'INFO'}, f"Server started on ws://{props.server_host}:{props.server_port}")
        return {'FINISHED'}


class GEOMETRY2D_OT_stop_server(bpy.types.Operator):
    """Stop the WebSocket server"""
    bl_idname = "geometry2d.stop_server"
    bl_label = "Stop Server"

    def execute(self, context):
        global ws_server

        if ws_server:
            ws_server.stop()
            ws_server = None
            self.report({'INFO'}, "Server stopped")

        return {'FINISHED'}


class GEOMETRY2D_OT_send_cross_section(bpy.types.Operator):
    """Send current cross-section to connected clients"""
    bl_idname = "geometry2d.send_cross_section"
    bl_label = "Send Cross-Section"

    def execute(self, context):
        global ws_server

        if not ws_server or not ws_server.running:
            self.report({'WARNING'}, "Server not running")
            return {'CANCELLED'}

        obj = context.active_object
        if not obj or obj.type != 'MESH':
            self.report({'WARNING'}, "Select a mesh object")
            return {'CANCELLED'}

        props = context.scene.geometry2d_props

        # Calculate cross-section
        plane_normal = Vector((0, 1, 0))  # Y normal
        plane_point = Vector((0, props.cut_plane_position, 0))

        calculator = CrossSectionCalculator()
        polygons = calculator.get_cross_section_polygon(obj, plane_point, plane_normal)
        volume = calculator.get_mesh_volume(obj)
        bounds = calculator.get_mesh_bounds(obj)

        message = {
            'type': 'cross_section_update',
            'object': obj.name,
            'polygons': polygons,
            'volume': volume,
            'bounds': bounds,
            'cut_position': props.cut_plane_position
        }

        # Broadcast to all clients
        if ws_server.loop and ws_server.clients:
            asyncio.run_coroutine_threadsafe(
                ws_server.broadcast(message),
                ws_server.loop
            )
            self.report({'INFO'}, f"Sent cross-section with {len(polygons)} polygons")

        return {'FINISHED'}


class GEOMETRY2D_Props(bpy.types.PropertyGroup):
    """Properties for the 2D Geometry Bridge"""

    server_host: StringProperty(
        name="Host",
        default="localhost",
        description="WebSocket server host"
    )

    server_port: IntProperty(
        name="Port",
        default=8765,
        min=1024,
        max=65535,
        description="WebSocket server port"
    )

    cut_plane_position: FloatProperty(
        name="Cut Plane Y",
        default=0.0,
        description="Y position of the cutting plane"
    )

    auto_update: BoolProperty(
        name="Auto Update",
        default=False,
        description="Automatically send updates when object changes"
    )


class GEOMETRY2D_PT_main_panel(bpy.types.Panel):
    """Main panel for 2D Geometry Bridge"""
    bl_label = "2D Geometry Bridge"
    bl_idname = "GEOMETRY2D_PT_main_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = '2D Bridge'

    def draw(self, context):
        layout = self.layout
        props = context.scene.geometry2d_props

        # Server status
        global ws_server
        is_running = ws_server and ws_server.running

        box = layout.box()
        box.label(text="WebSocket Server", icon='LINKED')

        row = box.row()
        row.prop(props, "server_host")
        row.prop(props, "server_port")

        row = box.row()
        if is_running:
            row.operator("geometry2d.stop_server", text="Stop Server", icon='PAUSE')
            client_count = len(ws_server.clients) if ws_server else 0
            row.label(text=f"{client_count} clients")
        else:
            row.operator("geometry2d.start_server", text="Start Server", icon='PLAY')

        # Cross-section controls
        box = layout.box()
        box.label(text="Cross-Section", icon='MOD_BOOLEAN')

        box.prop(props, "cut_plane_position")
        box.prop(props, "auto_update")

        box.operator("geometry2d.send_cross_section", text="Send to Web App", icon='EXPORT')

        # Object info
        obj = context.active_object
        if obj and obj.type == 'MESH':
            box = layout.box()
            box.label(text=f"Selected: {obj.name}", icon='MESH_DATA')

            calculator = CrossSectionCalculator()
            volume = calculator.get_mesh_volume(obj)
            bounds = calculator.get_mesh_bounds(obj)

            if bounds:
                col = box.column(align=True)
                col.label(text=f"Volume: {volume:.3f} m³")
                col.label(text=f"Size: {bounds['size']['x']:.2f} x {bounds['size']['y']:.2f} x {bounds['size']['z']:.2f}")


# Auto-update handler
@bpy.app.handlers.persistent
def on_depsgraph_update(scene, depsgraph):
    """Send updates when objects change"""
    global ws_server

    if not ws_server or not ws_server.running:
        return

    props = scene.geometry2d_props
    if not props.auto_update:
        return

    # Check if active object was updated
    for update in depsgraph.updates:
        if update.id == bpy.context.active_object:
            bpy.ops.geometry2d.send_cross_section()
            break


# Registration
classes = [
    GEOMETRY2D_Props,
    GEOMETRY2D_OT_start_server,
    GEOMETRY2D_OT_stop_server,
    GEOMETRY2D_OT_send_cross_section,
    GEOMETRY2D_PT_main_panel,
]


def register():
    for cls in classes:
        bpy.utils.register_class(cls)

    bpy.types.Scene.geometry2d_props = bpy.props.PointerProperty(type=GEOMETRY2D_Props)
    bpy.app.handlers.depsgraph_update_post.append(on_depsgraph_update)

    print("2D Geometry Bridge addon registered")


def unregister():
    global ws_server
    if ws_server:
        ws_server.stop()

    bpy.app.handlers.depsgraph_update_post.remove(on_depsgraph_update)

    del bpy.types.Scene.geometry2d_props

    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)

    print("2D Geometry Bridge addon unregistered")


if __name__ == "__main__":
    register()
