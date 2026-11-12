package com.nottorzz.eyeball.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import net.minecraft.client.renderer.texture.OverlayTexture;
import org.joml.Matrix4f;
import org.joml.Vector3f;

/**
 * Emits lit, vertex-coloured quads in "face space" (pixels; u = right, v = up, w = out of the face)
 * into an entity vertex buffer. Triangles are written as degenerate quads because entity pipelines
 * draw quads. Positions and normals are transformed by the pose, so the geometry follows the head.
 */
public final class MeshWriter {
	private static final float U = 0.5F;
	private static final float V = 0.5F;

	private final PoseStack.Pose pose;
	private final Matrix4f matrix;
	private final VertexConsumer buffer;
	private final int light;
	private final int overlay = OverlayTexture.NO_OVERLAY;
	private final Vector3f position = new Vector3f();
	private final Vector3f normal = new Vector3f();
	private int quads;

	public MeshWriter(PoseStack.Pose pose, VertexConsumer buffer, int light) {
		this.pose = pose;
		this.matrix = pose.pose();
		this.buffer = buffer;
		this.light = light;
	}

	public void vertex(float x, float y, float z, int argb, float nx, float ny, float nz) {
		this.matrix.transformPosition(x, y, z, this.position);
		this.pose.transformNormal(nx, ny, nz, this.normal);
		this.buffer.addVertex(this.position.x, this.position.y, this.position.z, argb, U, V, this.overlay, this.light,
			this.normal.x, this.normal.y, this.normal.z);
	}

	/** A quad with one flat normal. Vertices should be counter-clockwise seen from the front. */
	public void quad(float x0, float y0, float z0, float x1, float y1, float z1,
					 float x2, float y2, float z2, float x3, float y3, float z3,
					 int argb, float nx, float ny, float nz) {
		this.vertex(x0, y0, z0, argb, nx, ny, nz);
		this.vertex(x1, y1, z1, argb, nx, ny, nz);
		this.vertex(x2, y2, z2, argb, nx, ny, nz);
		this.vertex(x3, y3, z3, argb, nx, ny, nz);
		this.quads++;
	}

	/** A triangle (written as a degenerate quad). */
	public void triangle(float x0, float y0, float z0, float x1, float y1, float z1, float x2, float y2, float z2,
						 int argb, float nx, float ny, float nz) {
		this.quad(x0, y0, z0, x1, y1, z1, x2, y2, z2, x2, y2, z2, argb, nx, ny, nz);
	}

	/** Quads written so far (for the performance test). */
	public int quadCount() {
		return this.quads;
	}

	public static int argb(int rgb) {
		return 0xFF000000 | rgb;
	}

	/** Linear blend between two RGB colours (alpha forced to opaque). */
	public static int mix(int a, int b, float t) {
		float k = Math.max(0.0F, Math.min(1.0F, t));
		int r = Math.round(((a >> 16) & 0xFF) * (1.0F - k) + ((b >> 16) & 0xFF) * k);
		int g = Math.round(((a >> 8) & 0xFF) * (1.0F - k) + ((b >> 8) & 0xFF) * k);
		int bl = Math.round((a & 0xFF) * (1.0F - k) + (b & 0xFF) * k);
		return 0xFF000000 | r << 16 | g << 8 | bl;
	}
}
