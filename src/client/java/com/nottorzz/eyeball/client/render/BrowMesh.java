package com.nottorzz.eyeball.client.render;

import net.minecraft.util.Mth;

/** An arched, tapered, extruded cartoon eyebrow in face space. */
public final class BrowMesh {
	public static final int DEFAULT_COLOR = 0x2C1D12;
	private static final int SEGMENTS = 10;

	private final float[] topX = new float[SEGMENTS + 1];
	private final float[] topY = new float[SEGMENTS + 1];
	private final float[] botX = new float[SEGMENTS + 1];
	private final float[] botY = new float[SEGMENTS + 1];
	private final float[] normX = new float[SEGMENTS + 1];
	private final float[] normY = new float[SEGMENTS + 1];

	/**
	 * @param angle radians, counter-clockwise in face space
	 * @param arch  how far the middle bulges up, pixels
	 */
	public void build(MeshWriter w, float cx, float cy, float length, float thickness, float back, float front,
					  float angle, float arch, int rgb) {
		float c = Mth.cos(angle);
		float s = Mth.sin(angle);
		for (int i = 0; i <= SEGMENTS; i++) {
			float t = -1.0F + 2.0F * i / SEGMENTS;
			float x = t * length * 0.5F;
			float y = arch * (1.0F - t * t);
			float dx = length * 0.5F;
			float dy = -2.0F * arch * t;
			float len = (float) Math.sqrt(dx * dx + dy * dy);
			float nx = -dy / len;
			float ny = dx / len;
			float half = thickness * 0.5F * (0.55F + 0.45F * (float) Math.sqrt(Math.max(0.0F, 1.0F - t * t)));
			float tx = x + nx * half;
			float ty = y + ny * half;
			float bx = x - nx * half;
			float by = y - ny * half;
			this.topX[i] = cx + tx * c - ty * s;
			this.topY[i] = cy + tx * s + ty * c;
			this.botX[i] = cx + bx * c - by * s;
			this.botY[i] = cy + bx * s + by * c;
			this.normX[i] = nx * c - ny * s;
			this.normY[i] = nx * s + ny * c;
		}
		int color = MeshWriter.argb(rgb);
		int side = MeshWriter.mix(rgb, 0x000000, 0.25F);
		for (int i = 0; i < SEGMENTS; i++) {
			// Front.
			w.quad(this.botX[i], this.botY[i], front, this.botX[i + 1], this.botY[i + 1], front,
				this.topX[i + 1], this.topY[i + 1], front, this.topX[i], this.topY[i], front, color, 0.0F, 0.0F, 1.0F);
			// Back.
			w.quad(this.topX[i], this.topY[i], back, this.topX[i + 1], this.topY[i + 1], back,
				this.botX[i + 1], this.botY[i + 1], back, this.botX[i], this.botY[i], back, side, 0.0F, 0.0F, -1.0F);
			// Top edge.
			w.vertex(this.topX[i], this.topY[i], front, side, this.normX[i], this.normY[i], 0.0F);
			w.vertex(this.topX[i + 1], this.topY[i + 1], front, side, this.normX[i + 1], this.normY[i + 1], 0.0F);
			w.vertex(this.topX[i + 1], this.topY[i + 1], back, side, this.normX[i + 1], this.normY[i + 1], 0.0F);
			w.vertex(this.topX[i], this.topY[i], back, side, this.normX[i], this.normY[i], 0.0F);
			// Bottom edge.
			w.vertex(this.botX[i + 1], this.botY[i + 1], front, side, -this.normX[i + 1], -this.normY[i + 1], 0.0F);
			w.vertex(this.botX[i], this.botY[i], front, side, -this.normX[i], -this.normY[i], 0.0F);
			w.vertex(this.botX[i], this.botY[i], back, side, -this.normX[i], -this.normY[i], 0.0F);
			w.vertex(this.botX[i + 1], this.botY[i + 1], back, side, -this.normX[i + 1], -this.normY[i + 1], 0.0F);
		}
		// End caps.
		float ex = -c;
		float ey = -s;
		w.quad(this.botX[0], this.botY[0], front, this.topX[0], this.topY[0], front,
			this.topX[0], this.topY[0], back, this.botX[0], this.botY[0], back, side, ex, ey, 0.0F);
		w.quad(this.topX[SEGMENTS], this.topY[SEGMENTS], front, this.botX[SEGMENTS], this.botY[SEGMENTS], front,
			this.botX[SEGMENTS], this.botY[SEGMENTS], back, this.topX[SEGMENTS], this.topY[SEGMENTS], back, side, -ex, -ey, 0.0F);
	}
}
