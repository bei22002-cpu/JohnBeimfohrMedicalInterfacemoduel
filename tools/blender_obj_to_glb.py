"""
Blender CLI helper:
  blender --background --factory-startup --python tools/blender_obj_to_glb.py -- <input.obj> <output.glb>
"""

import sys
from pathlib import Path


def die(msg: str, code: int = 2):
    print(msg, file=sys.stderr)
    raise SystemExit(code)


def main():
    argv = sys.argv
    if "--" not in argv:
        die("Expected '-- <input.obj> <output.glb>'")
    sep = argv.index("--")
    args = argv[sep + 1 :]
    if len(args) != 2:
        die("Usage: -- <input.obj> <output.glb>")
    in_path = Path(args[0]).resolve()
    out_path = Path(args[1]).resolve()
    if not in_path.exists():
        die(f"Input not found: {in_path}")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    import bpy  # type: ignore

    # Clean scene
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # Import OBJ
    bpy.ops.import_scene.obj(filepath=str(in_path), axis_forward="-Z", axis_up="Y")

    # Ensure something is selected
    if not bpy.context.selected_objects:
        die("OBJ import produced no objects.")

    # Export GLB
    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="NONE",
    )

    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()

