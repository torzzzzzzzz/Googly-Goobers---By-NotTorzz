package com.nottorzz.eyeball.client.render;

import net.minecraft.util.Mth;

/** A shiny orange ellipsoid nose (Elmo look). */
public final class NoseMesh {
	private static final int BASE = 0xFF8A1E;
	private static final int SHINE = 0xFFD08A;
	private static final int SHADOW = 0xD8620C;

	public static void build(MeshWriter w, float cx, float cy, float cw, float rx, float ry, float rz, int latitudes, int longitudes) {
		// Light comes from the upper left front: highlights there, shadow underneath.
		float lx = -0.45F;
		float ly = 0.6F;
		float lz = 0.66F;
		for (int i = 0; i < latitudes; i++) {
			float t0 = Mth.PI * i / latitudes;
			float t1 = Mth.PI * (i + 1) / latitudes;
			for (int j = 0; j < longitudes; j++) {
				float p0 = Mth.TWO_PI * j / longitudes;
				float p1 = Mth.TWO_PI * (j + 1) / longitudes;
				vertex(w, cx, cy, cw, rx, ry, rz, t0, p0, lx, ly, lz);
				vertex(w, cx, cy, cw, rx, ry, rz, t0, p1, lx, ly, lz);
				vertex(w, cx, cy, cw, rx, ry, rz, t1, p1, lx, ly, lz);
				vertex(w, cx, cy, cw, rx, ry, rz, t1, p0, lx, ly, lz);
			}
		}
	}

	private static void vertex(MeshWriter w, float cx, float cy, float cw, float rx, float ry, float rz,
							   float theta, float phi, float lx, float ly, float lz) {
		float st = Mth.sin(theta);
		float ux = st * Mth.cos(phi);
		float uy = Mth.cos(theta);
		float uz = st * Mth.sin(phi);
		float nx = ux / rx;
		float ny = uy / ry;
		float nz = uz / rz;
		float len = (float) Math.sqrt(nx * nx + ny * ny + nz * nz);
		nx /= len;
		ny /= len;
		nz /= len;
		float light = nx * lx + ny * ly + nz * lz;
		int color = light > 0.0F
			? MeshWriter.mix(BASE, SHINE, (float) Math.pow(light, 6.0) * 0.9F)
			: MeshWriter.mix(BASE, SHADOW, Math.min(1.0F, -light * 0.8F));
		w.vertex(cx + rx * ux, cy + ry * uy, cw + rz * uz, color, nx, ny, nz);
	}
}
