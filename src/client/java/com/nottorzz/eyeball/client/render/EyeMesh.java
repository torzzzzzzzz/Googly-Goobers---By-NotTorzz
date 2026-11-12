package com.nottorzz.eyeball.client.render;

import net.minecraft.util.Mth;

/**
 * Builds one 3D eyeball in face space.
 * <p>
 * Googly style (matches the reference pictures): a short cylinder sticking out of the face with a
 * black plastic side and lip, a domed white front with soft edge shading, and a big black pupil
 * with shiny highlights draped over the dome. Spiral style replaces the pupil with a thick black
 * hypnotic spiral (and turns the lip grey). Elmo style is a softer white eye with a thin outline.
 * <p>
 * Blinking squashes the eye vertically (a classic cartoon blink); normals are corrected for it.
 */
public final class EyeMesh {
	private static final int GOOGLY_RIM = 0x15151A;
	private static final int GOOGLY_LIP = 0x0E0E12;
	private static final int SPIRAL_LIP = 0x8C8C96;
	private static final int ELMO_RIM = 0xEDEDEF;
	private static final int ELMO_LIP = 0x2A1C1C;
	private static final int WHITE_CENTER = 0xFFFFFF;
	private static final int WHITE_EDGE = 0xCCD2DE;
	private static final int PUPIL = 0x0A0A0D;
	private static final int PUPIL_EDGE = 0x1D1D24;
	private static final int HIGHLIGHT = 0xFFFFFF;
	private static final int SPIRAL = 0x0B0B0F;
	private static final int DOME_RINGS = 5;
	private static final float SPIRAL_TURNS = 2.75F;

	private final float[] cos = new float[65];
	private final float[] sin = new float[65];
	private int segments = -1;

	// Per-eye parameters (set before build()).
	public float centerU;
	public float centerV;
	public float radius;
	public float base;
	public float depth;
	public float dome;
	public float open = 1.0F;
	public float pupilX;
	public float pupilY;
	public float pupilFraction = 0.45F;
	public boolean spiral;
	public float spiralAngle;
	public float spiralGrow = 1.0F;
	public boolean elmoStyle;

	// Derived values.
	private float sx;
	private float sy;
	private float innerRadius;
	private float domeBaseW;
	private float sphereRadius;

	public void build(MeshWriter w, int segmentCount) {
		this.prepareTable(Math.clamp(segmentCount, 8, 64));
		int n = this.segments;
		this.sy = Math.max(0.05F, this.open);
		this.sx = 1.0F + (1.0F - this.sy) * 0.1F;
		float lip = this.elmoStyle ? 0.09F : 0.2F;
		float r = this.radius;
		this.innerRadius = r * (1.0F - lip);
		float front = this.base + this.depth;
		float bevel = this.elmoStyle ? 0.05F : 0.12F;
		this.domeBaseW = front + bevel;
		float h = Math.max(0.05F, this.dome);
		this.sphereRadius = (this.innerRadius * this.innerRadius + h * h) / (2.0F * h);
		int rim = MeshWriter.argb(this.elmoStyle ? ELMO_RIM : GOOGLY_RIM);
		int lipColor = MeshWriter.argb(this.spiral ? SPIRAL_LIP : this.elmoStyle ? ELMO_LIP : GOOGLY_LIP);
		float cu = this.centerU;
		float cv = this.centerV;

		// 1. Side wall (smooth normals around the ellipse).
		for (int k = 0; k < n; k++) {
			float x0 = cu + r * this.cos[k] * this.sx;
			float y0 = cv + r * this.sin[k] * this.sy;
			float x1 = cu + r * this.cos[k + 1] * this.sx;
			float y1 = cv + r * this.sin[k + 1] * this.sy;
			float n0x = this.cos[k] * this.sy;
			float n0y = this.sin[k] * this.sx;
			float n1x = this.cos[k + 1] * this.sy;
			float n1y = this.sin[k + 1] * this.sx;
			w.vertex(x0, y0, this.base, rim, n0x, n0y, 0.0F);
			w.vertex(x1, y1, this.base, rim, n1x, n1y, 0.0F);
			w.vertex(x1, y1, front, rim, n1x, n1y, 0.0F);
			w.vertex(x0, y0, front, rim, n0x, n0y, 0.0F);
		}

		// 2. Back cap, so the eye never looks hollow where it sticks out past the head.
		for (int k = 0; k < n; k++) {
			w.triangle(cu, cv, this.base,
				cu + r * this.cos[k + 1] * this.sx, cv + r * this.sin[k + 1] * this.sy, this.base,
				cu + r * this.cos[k] * this.sx, cv + r * this.sin[k] * this.sy, this.base,
				rim, 0.0F, 0.0F, -1.0F);
		}

		// 3. Front lip ring (bevelled towards the dome).
		float ri = this.innerRadius;
		for (int k = 0; k < n; k++) {
			float c0 = this.cos[k];
			float s0 = this.sin[k];
			float c1 = this.cos[k + 1];
			float s1 = this.sin[k + 1];
			w.vertex(cu + r * c0 * this.sx, cv + r * s0 * this.sy, front, lipColor, c0 * 0.4F * this.sy, s0 * 0.4F * this.sx, 0.92F);
			w.vertex(cu + r * c1 * this.sx, cv + r * s1 * this.sy, front, lipColor, c1 * 0.4F * this.sy, s1 * 0.4F * this.sx, 0.92F);
			w.vertex(cu + ri * c1 * this.sx, cv + ri * s1 * this.sy, this.domeBaseW, lipColor, c1 * 0.15F, s1 * 0.15F, 0.99F);
			w.vertex(cu + ri * c0 * this.sx, cv + ri * s0 * this.sy, this.domeBaseW, lipColor, c0 * 0.15F, s0 * 0.15F, 0.99F);
		}

		// 4. White dome: rings of a spherical cap, softly darker towards the edge.
		float phiMax = (float) Math.asin(Math.min(1.0, ri / this.sphereRadius));
		for (int j = 0; j < DOME_RINGS; j++) {
			float phiA = phiMax * (1.0F - (float) j / DOME_RINGS);
			float phiB = phiMax * (1.0F - (float) (j + 1) / DOME_RINGS);
			float rA = this.sphereRadius * Mth.sin(phiA);
			float rB = this.sphereRadius * Mth.sin(phiB);
			float wA = this.domeW(rA);
			float wB = this.domeW(rB);
			int colorA = MeshWriter.mix(WHITE_CENTER, WHITE_EDGE, (float) Math.pow(rA / ri, 2.4));
			int colorB = MeshWriter.mix(WHITE_CENTER, WHITE_EDGE, (float) Math.pow(rB / ri, 2.4));
			float sinA = Mth.sin(phiA);
			float cosA = Mth.cos(phiA);
			float sinB = Mth.sin(phiB);
			float cosB = Mth.cos(phiB);
			for (int k = 0; k < n; k++) {
				this.domeVertex(w, rA * this.cos[k], rA * this.sin[k], wA, colorA, sinA * this.cos[k], sinA * this.sin[k], cosA);
				this.domeVertex(w, rA * this.cos[k + 1], rA * this.sin[k + 1], wA, colorA, sinA * this.cos[k + 1], sinA * this.sin[k + 1], cosA);
				this.domeVertex(w, rB * this.cos[k + 1], rB * this.sin[k + 1], wB, colorB, sinB * this.cos[k + 1], sinB * this.sin[k + 1], cosB);
				this.domeVertex(w, rB * this.cos[k], rB * this.sin[k], wB, colorB, sinB * this.cos[k], sinB * this.sin[k], cosB);
			}
		}

		// 5. Pupil or spiral, draped over the dome.
		if (this.spiral) {
			this.buildSpiral(w);
		} else {
			this.buildPupil(w);
		}
	}

	private void buildPupil(MeshWriter w) {
		float ri = this.innerRadius;
		float rp = Mth.clamp(ri * this.pupilFraction, ri * 0.15F, ri * 0.82F);
		float maxOffset = Math.max(0.0F, ri - rp - ri * 0.05F);
		float pcx = this.pupilX * maxOffset;
		float pcy = this.pupilY * maxOffset;
		int n = this.segments;
		// Concentric rings, so the pupil hugs the curved dome instead of cutting under it.
		int rings = 4;
		float lift = 0.045F;
		for (int j = 0; j < rings; j++) {
			float r0 = rp * j / rings;
			float r1 = rp * (j + 1) / rings;
			int c0 = MeshWriter.mix(PUPIL, PUPIL_EDGE, (float) j / rings);
			int c1 = MeshWriter.mix(PUPIL, PUPIL_EDGE, (float) (j + 1) / rings);
			for (int k = 0; k < n; k++) {
				float ox0 = pcx + r1 * this.cos[k];
				float oy0 = pcy + r1 * this.sin[k];
				float ox1 = pcx + r1 * this.cos[k + 1];
				float oy1 = pcy + r1 * this.sin[k + 1];
				if (j == 0) {
					this.surfaceTriangle(w, pcx, pcy, c0, ox0, oy0, c1, ox1, oy1, c1, lift);
				} else {
					float ix0 = pcx + r0 * this.cos[k];
					float iy0 = pcy + r0 * this.sin[k];
					float ix1 = pcx + r0 * this.cos[k + 1];
					float iy1 = pcy + r0 * this.sin[k + 1];
					this.surfaceVertex(w, ix0, iy0, c0, lift);
					this.surfaceVertex(w, ox0, oy0, c1, lift);
					this.surfaceVertex(w, ox1, oy1, c1, lift);
					this.surfaceVertex(w, ix1, iy1, c0, lift);
				}
			}
		}
		// Shiny highlights make the eyes look wet and alive.
		int highlight = MeshWriter.argb(HIGHLIGHT);
		this.surfaceDisc(w, pcx + rp * 0.34F, pcy + rp * 0.38F, rp * 0.27F, highlight, 0.085F, Math.max(8, n / 2));
		this.surfaceDisc(w, pcx - rp * 0.3F, pcy - rp * 0.36F, rp * 0.11F, highlight, 0.085F, 8);
	}

	private void buildSpiral(MeshWriter w) {
		float ri = this.innerRadius;
		float grow = Mth.clamp(this.spiralGrow, 0.05F, 1.0F);
		float rStart = ri * 0.04F;
		float rEnd = ri * 0.93F * grow;
		float pitch = (rEnd - rStart) / SPIRAL_TURNS;
		float bandHalf = pitch * 0.27F;
		int steps = Math.clamp(this.segments * 3, 60, 120);
		int color = MeshWriter.argb(SPIRAL);
		float prevInnerX = 0.0F;
		float prevInnerY = 0.0F;
		float prevOuterX = 0.0F;
		float prevOuterY = 0.0F;
		for (int i = 0; i <= steps; i++) {
			float t = (float) i / steps;
			float theta = t * SPIRAL_TURNS * Mth.TWO_PI;
			float radiusHere = rStart + (rEnd - rStart) * t;
			// Clockwise spin.
			float angle = theta - this.spiralAngle;
			float taper = 0.45F + 0.55F * Math.min(1.0F, t * 3.0F);
			float inner = Math.max(0.0F, radiusHere - bandHalf * taper);
			float outer = Math.min(ri * 0.985F, radiusHere + bandHalf * taper);
			float c = Mth.cos(angle);
			float s = Mth.sin(angle);
			float innerX = inner * c;
			float innerY = inner * s;
			float outerX = outer * c;
			float outerY = outer * s;
			if (i > 0) {
				this.surfaceQuad(w, prevInnerX, prevInnerY, prevOuterX, prevOuterY, outerX, outerY, innerX, innerY, color, 0.045F);
			}
			prevInnerX = innerX;
			prevInnerY = innerY;
			prevOuterX = outerX;
			prevOuterY = outerY;
		}
		this.surfaceDisc(w, 0.0F, 0.0F, bandHalf * 1.25F, color, 0.045F, 10);
	}

	/** Height of the dome at distance {@code r} from the eye centre. */
	private float domeW(float r) {
		float s = this.sphereRadius;
		return this.domeBaseW + this.dome - s + (float) Math.sqrt(Math.max(0.0F, s * s - r * r));
	}

	private void domeVertex(MeshWriter w, float x, float y, float wPos, int color, float nx, float ny, float nz) {
		// Squash correction: normals scale by the inverse of the squash.
		w.vertex(this.centerU + x * this.sx, this.centerV + y * this.sy, wPos, color, nx / this.sx, ny / this.sy, nz);
	}

	private void surfaceVertex(MeshWriter w, float x, float y, int color, float lift) {
		float r = (float) Math.sqrt(x * x + y * y);
		float s = this.sphereRadius;
		float nz = (float) Math.sqrt(Math.max(0.0F, 1.0F - r * r / (s * s)));
		this.domeVertex(w, x, y, this.domeW(r) + lift, color, x / s, y / s, nz);
	}

	private void surfaceTriangle(MeshWriter w, float x0, float y0, int c0, float x1, float y1, int c1, float x2, float y2, int c2, float lift) {
		this.surfaceVertex(w, x0, y0, c0, lift);
		this.surfaceVertex(w, x1, y1, c1, lift);
		this.surfaceVertex(w, x2, y2, c2, lift);
		this.surfaceVertex(w, x2, y2, c2, lift);
	}

	private void surfaceQuad(MeshWriter w, float x0, float y0, float x1, float y1, float x2, float y2, float x3, float y3, int color, float lift) {
		this.surfaceVertex(w, x0, y0, color, lift);
		this.surfaceVertex(w, x1, y1, color, lift);
		this.surfaceVertex(w, x2, y2, color, lift);
		this.surfaceVertex(w, x3, y3, color, lift);
	}

	private void surfaceDisc(MeshWriter w, float cx, float cy, float radius, int color, float lift, int pieces) {
		for (int k = 0; k < pieces; k++) {
			float a0 = Mth.TWO_PI * k / pieces;
			float a1 = Mth.TWO_PI * (k + 1) / pieces;
			this.surfaceTriangle(w, cx, cy, color,
				cx + radius * Mth.cos(a0), cy + radius * Mth.sin(a0), color,
				cx + radius * Mth.cos(a1), cy + radius * Mth.sin(a1), color, lift);
		}
	}

	private void prepareTable(int n) {
		if (n == this.segments) {
			return;
		}
		this.segments = n;
		for (int k = 0; k <= n; k++) {
			double a = Math.PI * 2.0 * k / n;
			this.cos[k] = (float) Math.cos(a);
			this.sin[k] = (float) Math.sin(a);
		}
	}
}
