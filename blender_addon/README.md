# Blender 2D Geometry Bridge Addon

This addon allows you to connect Blender to the 2D Geometry web app and view cross-sections of your 3D models in real-time.

## Requirements

- Blender 3.0 or newer
- Python `websockets` module

## Installation

### 1. Install websockets module

Open Blender's Python console (Scripting workspace) and run:

```python
import subprocess
import sys
subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'websockets'])
```

Or from terminal (find your Blender Python path):
```bash
# Linux
/path/to/blender/3.x/python/bin/python3.x -m pip install websockets

# Windows
"C:\Program Files\Blender Foundation\Blender 3.x\3.x\python\bin\python.exe" -m pip install websockets

# macOS
/Applications/Blender.app/Contents/Resources/3.x/python/bin/python3.x -m pip install websockets
```

### 2. Install the addon

1. Open Blender
2. Go to **Edit > Preferences > Add-ons**
3. Click **Install...**
4. Select `geometry_bridge.py`
5. Enable the addon by checking the box

## Usage

1. In Blender, open the sidebar (press `N`) and find the **2D Bridge** tab
2. Click **Start Server** (default: localhost:8765)
3. In the web app, enter the host:port and click **Connect**
4. Select a mesh object in Blender
5. Use **Send Cross-Section** or click **Get Cross-Section** in the web app

## Features

- **Real-time connection**: WebSocket communication for instant updates
- **Cross-section extraction**: Cut meshes at any Y plane
- **Volume calculation**: Get mesh volume data
- **Bounding box**: Get object dimensions
- **Auto-update**: Optionally sync changes automatically

## Panel Controls

| Control | Description |
|---------|-------------|
| Host | WebSocket server host (default: localhost) |
| Port | WebSocket server port (default: 8765) |
| Start/Stop Server | Toggle the WebSocket server |
| Cut Plane Y | Y position of the cutting plane |
| Auto Update | Automatically send updates when object changes |
| Send to Web App | Manually send current cross-section |

## API Messages

The addon accepts JSON messages with the following actions:

| Action | Parameters | Description |
|--------|------------|-------------|
| `ping` | - | Check connection |
| `get_objects` | - | List all mesh objects |
| `get_cross_section` | `object`, `plane_y`, `plane_normal` | Get cross-section |
| `get_volume` | `object` | Get mesh volume |
| `get_bounds` | `object` | Get bounding box |
| `get_selected` | - | Get selected object data |

## Troubleshooting

**"websockets module not found"**
- Install the websockets module as described above

**Connection refused**
- Make sure the server is started in Blender
- Check the port number matches
- Check firewall settings

**No cross-section visible**
- Ensure the cut plane intersects the mesh
- Try adjusting the Cut Plane Y value
- Make sure the object is a valid closed mesh
