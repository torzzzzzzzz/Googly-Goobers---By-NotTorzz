package com.nottorzz.eyeball.client.render;

import net.minecraft.util.Mth;

/** Chunky 3D cartoon stars that orbit a dizzy head. */
public final class StarMesh {
	private static final int FRONT = 0xFFE23D;
	private static final int BACK = 0xFFD21F;
	private static final int SIDE = 0xE0A000;
	private static final int POINTS = 5;

	private final float[] px = new float[POINTS * 2 + 1];
	private final float[] py = new float[POINTS * 2 + 1];

	/**
	 * @param orbitAngle angle around the head (the star faces outwards)
	 * @param spin       rotation of the star around its own centre
	 */
	public void build(MeshWriter w, float cx, float cy, float cw, float orbitAngle, float radius, float spin, float thickness) {
		if (radius <= 0.01F) {
			return;
		}
		// Star plane axes: X = (sin a, 0, -cos a), Y = up; facing R = (cos a, 0, sin a).
		float ax = Mth.sin(orbitAngle);
		float az = -Mth.cos(orbitAngle);
		float rx = Mth.cos(orbitAngle);
		float rz = Mth.sin(orbitAngle);
		float inner = radius * 0.45F;
		for (int k = 0; k <= POINTS * 2; k++) {
			float a = spin + Mth.HALF_PI + k * Mth.PI / POINTS;
			float r = (k % 2 == 0) ? radius : inner;
			this.px[k] = r * Mth.cos(a);
			this.py[k] = r * Mth.sin(a);
		}
		float half = thickness * 0.5F;
		int front = MeshWriter.argb(FRONT);
		int back = MeshWriter.argb(BACK);
		int side = MeshWriter.argb(SIDE);
		float fx = cx + rx * half;
		float fz = cw + rz * half;
		float bx = cx - rx * half;
		float bz = cw - rz * half;
		for (int k = 0; k < POINTS * 2; k++) {
			float x0 = this.px[k];
			float y0 = this.py[k];
			float x1 = this.px[k + 1];
			float y1 = this.py[k + 1];
			// Front and back faces (fans from the centre).
			w.triangle(fx, cy, fz,
				fx + ax * x0, cy + y0, fz + az * x0,
				fx + ax * x1, cy + y1, fz + az * x1, front, rx, 0.0F, rz);
			w.triangle(bx, cy, bz,
				bx + ax * x1, cy + y1, bz + az * x1,
				bx + ax * x0, cy + y0, bz + az * x0, back, -rx, 0.0F, -rz);
			// Side wall.
			float ex = x1 - x0;
			float ey = y1 - y0;
			float len = (float) Math.sqrt(ex * ex + ey * ey);
			float onx = ey / len;
			float ony = -ex / len;
			w.quad(fx + ax * x0, cy + y0, fz + az * x0,
				bx + ax * x0, cy + y0, bz + az * x0,
				bx + ax * x1, cy + y1, bz + az * x1,
				fx + ax * x1, cy + y1, fz + az * x1,
				side, ax * onx, ony, az * onx);
		}
	}
}
