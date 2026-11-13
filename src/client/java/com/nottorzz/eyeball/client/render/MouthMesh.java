package com.nottorzz.eyeball.client.render;

import net.minecraft.util.Mth;

/**
 * A parametric cartoon mouth in face space. One continuous shape covers every expression:
 * <ul>
 *     <li>the height: 0 = closed line, up to a huge screaming oval</li>
 *     <li>{@code smile} curls the corners up (smile) or down (frown)</li>
 *     <li>{@code dShape} 0 = round "O", 1 = flat-topped "D" (laughing / excited)</li>
 *     <li>{@code teeth} shows the top teeth, and above 0.75 the bottom teeth too (angry)</li>
 *     <li>{@code uvula} the little dangling uvula at the back of a wide-open mouth (screaming)</li>
 * </ul>
 * It has a dark outline, a dark interior, a tongue and a little 3D thickness, so it reads well
 * from a distance and from the side.
 * <p>
 * Built in two steps: {@link #shape} computes the outline (so the face layout can keep the mouth on
 * the face and move the eyes out of its way), then {@link #draw} emits the geometry.
 */
public final class MouthMesh {
	public static final int SEGMENTS = 18;
	public static final float OUTLINE = 0.3F;
	private static final int UVULA_SEGMENTS = 8;

	final float[] xs = new float[SEGMENTS + 1];
	final float[] top = new float[SEGMENTS + 1];
	final float[] bottom = new float[SEGMENTS + 1];
	private float height;

	/**
	 * Computes the mouth outline.
	 *
	 * @param height opening in pixels (0 = closed)
	 */
	public void shape(float cx, float cy, float width, float height, float smile, float dShape) {
		float h = Math.max(0.0F, height);
		this.height = h;
		float topShare = Mth.lerp(dShape, 0.5F, 0.12F);
		float minHalf = 0.2F;
		for (int i = 0; i <= SEGMENTS; i++) {
			float s = -1.0F + 2.0F * i / SEGMENTS;
			float e = (float) Math.sqrt(Math.max(0.0F, 1.0F - s * s));
			float eTop = Mth.lerp(dShape, e, (float) Math.pow(e, 0.3));
			float mid = smile * width * 0.14F * (s * s - 0.33F);
			float t = mid + h * topShare * eTop;
			float b = mid - h * (1.0F - topShare) * e;
			float closedHalf = minHalf * (float) Math.pow(e, 0.35);
			if (t - b < 2.0F * closedHalf) {
				float m = (t + b) * 0.5F;
				t = m + closedHalf;
				b = m - closedHalf;
			}
			this.xs[i] = cx + s * width * 0.5F;
			this.top[i] = cy + t;
			this.bottom[i] = cy + b;
		}
	}

	/** Moves the whole mouth up (positive) or down. */
	public void shift(float dv) {
		for (int i = 0; i <= SEGMENTS; i++) {
			this.top[i] += dv;
			this.bottom[i] += dv;
		}
	}

	/** Lowest point of the mouth including its outline. */
	public float lowest() {
		float min = Float.POSITIVE_INFINITY;
		for (float b : this.bottom) {
			min = Math.min(min, b);
		}
		return min - OUTLINE;
	}

	/** Highest point of the mouth including its outline. */
	public float highest() {
		float max = Float.NEGATIVE_INFINITY;
		for (float t : this.top) {
			max = Math.max(max, t);
		}
		return max + OUTLINE;
	}

	/** Height of the opening in pixels at the middle of the mouth. */
	public float openingHeight() {
		return this.top[SEGMENTS / 2] - this.bottom[SEGMENTS / 2];
	}

	public void draw(MeshWriter w, float cx, float width, float teeth, float uvula, float front, float back) {
		int outline = MeshWriter.argb(0x2A0D10);
		int interiorTop = MeshWriter.argb(0x2A060C);
		int interiorBottom = MeshWriter.argb(0x5C1322);
		int tongue = MeshWriter.argb(0xE36A80);
		int uvulaColor = MeshWriter.argb(0xD9586F);
		int toothColor = MeshWriter.argb(0xF6F2E8);

		// 3D thickness: walls from the outline back to the face.
		float halfW = width * 0.5F;
		for (int i = 0; i < SEGMENTS; i++) {
			float s0 = -1.0F + 2.0F * i / SEGMENTS;
			float s1 = -1.0F + 2.0F * (i + 1) / SEGMENTS;
			float x0 = cx + s0 * (halfW + OUTLINE);
			float x1 = cx + s1 * (halfW + OUTLINE);
			float t0 = this.top[i] + OUTLINE;
			float t1 = this.top[i + 1] + OUTLINE;
			float b0 = this.bottom[i] - OUTLINE;
			float b1 = this.bottom[i + 1] - OUTLINE;
			w.quad(x0, t0, front, x1, t1, front, x1, t1, back, x0, t0, back, outline, 0.0F, 1.0F, 0.0F);
			w.quad(x1, b1, front, x0, b0, front, x0, b0, back, x1, b1, back, outline, 0.0F, -1.0F, 0.0F);
		}

		// Outline (slightly larger shape behind the interior).
		for (int i = 0; i < SEGMENTS; i++) {
			float s0 = -1.0F + 2.0F * i / SEGMENTS;
			float s1 = -1.0F + 2.0F * (i + 1) / SEGMENTS;
			float x0 = cx + s0 * (halfW + OUTLINE);
			float x1 = cx + s1 * (halfW + OUTLINE);
			w.quad(x0, this.bottom[i] - OUTLINE, front, x1, this.bottom[i + 1] - OUTLINE, front,
				x1, this.top[i + 1] + OUTLINE, front, x0, this.top[i] + OUTLINE, front, outline, 0.0F, 0.0F, 1.0F);
		}

		// Interior, darker towards the top for depth.
		float wInterior = front + 0.02F;
		for (int i = 0; i < SEGMENTS; i++) {
			w.vertex(this.xs[i], this.bottom[i], wInterior, interiorBottom, 0.0F, 0.0F, 1.0F);
			w.vertex(this.xs[i + 1], this.bottom[i + 1], wInterior, interiorBottom, 0.0F, 0.0F, 1.0F);
			w.vertex(this.xs[i + 1], this.top[i + 1], wInterior, interiorTop, 0.0F, 0.0F, 1.0F);
			w.vertex(this.xs[i], this.top[i], wInterior, interiorTop, 0.0F, 0.0F, 1.0F);
		}

		if (this.height < 0.3F) {
			return;
		}
		// Tongue: a hump resting on the bottom of the mouth.
		float wTongue = front + 0.04F;
		float tongueReach = 0.72F;
		for (int i = 0; i < SEGMENTS; i++) {
			float s0 = -1.0F + 2.0F * i / SEGMENTS;
			float s1 = -1.0F + 2.0F * (i + 1) / SEGMENTS;
			float k0 = Math.abs(s0) < tongueReach ? (float) Math.sqrt(1.0F - (s0 / tongueReach) * (s0 / tongueReach)) : 0.0F;
			float k1 = Math.abs(s1) < tongueReach ? (float) Math.sqrt(1.0F - (s1 / tongueReach) * (s1 / tongueReach)) : 0.0F;
			if (k0 <= 0.0F && k1 <= 0.0F) {
				continue;
			}
			float h0 = Math.min((this.top[i] - this.bottom[i]) * 0.42F, 1.8F) * k0;
			float h1 = Math.min((this.top[i + 1] - this.bottom[i + 1]) * 0.42F, 1.8F) * k1;
			float b0 = this.bottom[i] + 0.02F;
			float b1 = this.bottom[i + 1] + 0.02F;
			w.quad(this.xs[i], b0, wTongue, this.xs[i + 1], b1, wTongue,
				this.xs[i + 1], b1 + h1, wTongue, this.xs[i], b0 + h0, wTongue, tongue, 0.0F, 0.0F, 1.0F);
		}

		if (uvula > 0.02F) {
			this.drawUvula(w, cx, uvula, front + 0.045F, uvulaColor);
		}

		if (teeth < 0.05F) {
			return;
		}
		// Teeth: top row, and the bottom row too when the teeth are fully bared.
		float wTeeth = front + 0.05F;
		float teethReach = 0.62F;
		float bottomTeeth = Mth.clamp((teeth - 0.75F) * 4.0F, 0.0F, 1.0F);
		for (int i = 0; i < SEGMENTS; i++) {
			float s0 = -1.0F + 2.0F * i / SEGMENTS;
			float s1 = -1.0F + 2.0F * (i + 1) / SEGMENTS;
			if (Math.abs(s0) > teethReach && Math.abs(s1) > teethReach) {
				continue;
			}
			float k0 = Math.abs(s0) <= teethReach ? (float) Math.pow(1.0F - (s0 / teethReach) * (s0 / teethReach), 0.25) : 0.0F;
			float k1 = Math.abs(s1) <= teethReach ? (float) Math.pow(1.0F - (s1 / teethReach) * (s1 / teethReach), 0.25) : 0.0F;
			float span0 = this.top[i] - this.bottom[i];
			float span1 = this.top[i + 1] - this.bottom[i + 1];
			float d0 = Math.min(span0 * 0.3F, 0.8F) * teeth * k0;
			float d1 = Math.min(span1 * 0.3F, 0.8F) * teeth * k1;
			w.quad(this.xs[i], this.top[i] - d0, wTeeth, this.xs[i + 1], this.top[i + 1] - d1, wTeeth,
				this.xs[i + 1], this.top[i + 1] - 0.01F, wTeeth, this.xs[i], this.top[i] - 0.01F, wTeeth, toothColor, 0.0F, 0.0F, 1.0F);
			if (bottomTeeth > 0.0F) {
				float u0 = Math.min(span0 * 0.22F, 0.6F) * bottomTeeth * k0;
				float u1 = Math.min(span1 * 0.22F, 0.6F) * bottomTeeth * k1;
				w.quad(this.xs[i], this.bottom[i] + 0.01F, wTeeth, this.xs[i + 1], this.bottom[i + 1] + 0.01F, wTeeth,
					this.xs[i + 1], this.bottom[i + 1] + u1, wTeeth, this.xs[i], this.bottom[i] + u0, wTeeth, toothColor, 0.0F, 0.0F, 1.0F);
			}
		}
	}

	/** A little teardrop hanging from the middle of the top lip. */
	private void drawUvula(MeshWriter w, float cx, float amount, float wDepth, int color) {
		int mid = SEGMENTS / 2;
		float top = this.top[mid] - 0.02F;
		float span = this.top[mid] - this.bottom[mid];
		float length = Math.min(span * 0.3F, 1.35F) * amount;
		float radius = Math.min(0.42F, span * 0.1F) * (0.5F + 0.5F * amount);
		if (length < radius * 1.2F) {
			return;
		}
		float bulbY = top - length + radius;
		float stem = radius * 0.45F;
		w.quad(cx - stem, bulbY, wDepth, cx + stem, bulbY, wDepth, cx + stem * 1.25F, top, wDepth, cx - stem * 1.25F, top, wDepth,
			color, 0.0F, 0.0F, 1.0F);
		for (int k = 0; k < UVULA_SEGMENTS; k++) {
			float a0 = Mth.TWO_PI * k / UVULA_SEGMENTS;
			float a1 = Mth.TWO_PI * (k + 1) / UVULA_SEGMENTS;
			w.triangle(cx, bulbY, wDepth,
				cx + Mth.cos(a0) * radius, bulbY + Mth.sin(a0) * radius, wDepth,
				cx + Mth.cos(a1) * radius, bulbY + Mth.sin(a1) * radius, wDepth,
				color, 0.0F, 0.0F, 1.0F);
		}
	}
}
