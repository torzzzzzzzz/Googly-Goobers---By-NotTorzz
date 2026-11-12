package com.nottorzz.eyeball.client.render;

import com.nottorzz.eyeball.client.anim.FacePose;
import net.minecraft.util.Mth;

/**
 * Assembles a whole face (eyes, brows, mouth, nose, stars) from a {@link FaceRenderData}.
 * Runs on the render thread when the deferred geometry is drawn; the mesh helpers are reused.
 * <p>
 * Talking and screaming make the features much bigger than the head has room for, so the face is
 * laid out first ({@link #measure}):
 * <ol>
 *     <li>the mouth outline is computed and pushed up if a wide-open mouth would hang off the chin,</li>
 *     <li>the eyes swell mostly upwards and outwards and are moved up until they clear the mouth: the
 *     widest the mouth has opened recently, so they sit still above a flapping mouth,</li>
 *     <li>where big eyes overlap, the front eye sticks out further so the two never intersect,</li>
 *     <li>the brows sit on top of the eyes and grow with them.</li>
 * </ol>
 * Every step is a continuous function of the (spring-driven) pose, so nothing ever jumps.
 */
public final class FaceMeshBuilder {
	private static final int STAR_COUNT = 4;
	private static final EyeMesh EYE = new EyeMesh();
	private static final BrowMesh BROW = new BrowMesh();
	private static final MouthMesh MOUTH = new MouthMesh();
	private static final StarMesh STAR = new StarMesh();
	private static final FaceLayout LAYOUT = new FaceLayout();
	/** Top edge of the widest recent mouth, which the eyes keep clear of. */
	private static final float[] CLEAR_XS = new float[MouthMesh.SEGMENTS + 1];
	private static final float[] CLEAR_TOP = new float[MouthMesh.SEGMENTS + 1];

	/** Statistics for the performance test. */
	private static int lastQuadCount;
	private static long builtFaces;
	private static long buildNanos;

	private FaceMeshBuilder() {
	}

	/** Where every feature of one face goes in one frame (face-space pixels). */
	public static final class FaceLayout {
		public final float[] eyeU = new float[2];
		public final float[] eyeV = new float[2];
		public final float[] eyeRadius = new float[2];
		/** Top of each eye without the walk bounce (the brows sit here). */
		public final float[] eyeTop = new float[2];
		public float baseEyeRadius;
		/** How much further the front eye sticks out because the eyes overlap. */
		public float frontPush;
		public float mouthWidth;
		/** Opening height in the middle of the mouth. */
		public float mouthHeight;
		public float mouthTop;
		public float mouthBottom;
		/** Smallest distance between an eye's edge and the mouth's outline (negative = overlapping). */
		public float eyeMouthGap;
		float open;
		float smile;
		float dShape;
	}

	public static void build(MeshWriter w, FaceRenderData data, FaceAnchor anchor) {
		long start = System.nanoTime();
		buildFace(w, data, anchor);
		lastQuadCount = w.quadCount();
		builtFaces++;
		buildNanos += System.nanoTime() - start;
	}

	/** Lays out a face without drawing it (used by the tests to measure sizes and check for overlaps). */
	public static FaceLayout measure(FaceRenderData data, FaceAnchor anchor) {
		FaceLayout layout = new FaceLayout();
		layout(data, anchor, layout);
		return layout;
	}

	private static void layout(FaceRenderData data, FaceAnchor anchor, FaceLayout out) {
		FacePose pose = data.pose;
		float eyeSize = data.eyeSize;

		// ---------- Mouth outline first, so the eyes can make room for it ----------
		float open = pose.mouthOpen;
		float smile = pose.mouthSmile;
		float dShape = pose.mouthDShape;
		if (data.elmo) {
			// Elmo's big black half-moon mouth is always a little open (and goes round when he screams).
			open = 0.18F + 0.82F * open;
			dShape = Math.max(dShape, 0.55F * (1.0F - pose.scream));
			smile = smile + 0.25F * (1.0F - pose.scream);
		}
		// The space the eyes keep clear of: the widest recent mouth, round-topped and wide (the most room
		// it could need), so the eyes don't bob up and down with every syllable.
		float reach = Math.max(pose.mouthReach, pose.mouthOpen);
		if (data.elmo) {
			reach = 0.18F + 0.82F * reach;
		}
		shapeMouth(anchor, data, 1.15F, reach, smile, data.elmo ? dShape : 0.0F);
		System.arraycopy(MOUTH.xs, 0, CLEAR_XS, 0, CLEAR_XS.length);
		System.arraycopy(MOUTH.top, 0, CLEAR_TOP, 0, CLEAR_TOP.length);
		// The mouth that is drawn. Opening wider also stretches it sideways a little.
		float mouthWidth = shapeMouth(anchor, data, pose.mouthWidth, open, smile, dShape);
		out.open = open;
		out.smile = smile;
		out.dShape = dShape;
		out.mouthWidth = mouthWidth;
		out.mouthHeight = MOUTH.openingHeight();
		out.mouthTop = MOUTH.highest();
		out.mouthBottom = MOUTH.lowest();

		// ---------- Eyes ----------
		float baseRadius = anchor.eyeRadius() * eyeSize * (data.googly && data.elmo ? 1.08F : 1.0F);
		float spacing = anchor.eyeSpacing() * data.eyeSpacing * (0.8F + 0.2F * eyeSize);
		float restV = anchor.eyeY() + (baseRadius - anchor.eyeRadius()) * 0.35F;
		out.baseEyeRadius = baseRadius;
		float gap = Float.POSITIVE_INFINITY;
		for (int i = 0; i < 2; i++) {
			float side = i == 0 ? -1.0F : 1.0F;
			float radius = baseRadius * pose.eyeScale[i];
			float grow = radius - baseRadius;
			// Bigger eyes swell up and out (so they don't swallow the mouth); smaller ones shrink in place.
			float u = side * (spacing + Math.max(0.0F, grow) * anchor.eyeGrowOut());
			float v = restV + grow * (grow > 0.0F ? anchor.eyeGrowUp() : 0.35F);
			float clear = clearance(u, radius + anchor.featureGap());
			v = Math.max(v, clear);
			out.eyeU[i] = u;
			// The walk / jump bounce never pushes an eye into the mouth either.
			out.eyeV[i] = Math.max(v + pose.eyeBounce * (i == 0 ? 1.0F : 0.82F), clear);
			out.eyeRadius[i] = radius;
			out.eyeTop[i] = v + radius;
			gap = Math.min(gap, distanceToMouth(out.eyeU[i], out.eyeV[i]) - radius);
		}
		out.eyeMouthGap = gap;
		// Overlapping eyes: the front one sticks out far enough to cover the other one's dome.
		float distance = (float) Math.hypot(out.eyeU[0] - out.eyeU[1], out.eyeV[0] - out.eyeV[1]);
		float overlap = out.eyeRadius[0] + out.eyeRadius[1] - distance;
		float coverDepth = anchor.domeHeight() * (0.8F + 0.2F * eyeSize) * (float) Math.pow(Math.max(1.0F, pose.eyeScale[pose.frontEye]), 0.7) + 0.3F;
		out.frontPush = smoothstep(Mth.clamp(overlap / 1.2F, 0.0F, 1.0F)) * coverDepth;
	}

	/**
	 * Computes the mouth outline into {@link #MOUTH}: {@code widthFactor} times the face's mouth width
	 * (plus a little stretch as it opens), {@code open} times its maximum height, pushed up if it would
	 * hang off the chin. Returns the width.
	 */
	private static float shapeMouth(FaceAnchor anchor, FaceRenderData data, float widthFactor, float open, float smile, float dShape) {
		float width = anchor.mouthWidth() * data.mouthSize * widthFactor * (1.0F + 0.14F * Math.min(open, 1.2F));
		float height = Math.min(anchor.mouthHeight() * data.mouthSize * open, anchor.halfHeight() * 1.75F);
		MOUTH.shape(0.0F, anchor.mouthY(), width, height, smile, dShape, data.elmo);
		float overhang = anchor.chinLimit() - MOUTH.lowest();
		if (overhang > 0.0F) {
			MOUTH.shift(overhang);
		}
		return width;
	}

	/**
	 * Lowest centre height for an eye of radius {@code reach} at {@code u} that stays above both the
	 * drawn mouth and the widest recent mouth.
	 */
	private static float clearance(float u, float reach) {
		float need = Float.NEGATIVE_INFINITY;
		for (int k = 0; k <= MouthMesh.SEGMENTS; k++) {
			float dx = MOUTH.xs[k] - u;
			if (Math.abs(dx) < reach) {
				need = Math.max(need, MOUTH.top[k] + MouthMesh.OUTLINE + (float) Math.sqrt(reach * reach - dx * dx));
			}
			float cx = CLEAR_XS[k] - u;
			if (Math.abs(cx) < reach) {
				need = Math.max(need, CLEAR_TOP[k] + MouthMesh.OUTLINE + (float) Math.sqrt(reach * reach - cx * cx));
			}
		}
		return need;
	}

	/** Distance from a point to the nearest point of the mouth's top edge (including its outline). */
	private static float distanceToMouth(float u, float v) {
		float best = Float.POSITIVE_INFINITY;
		for (int k = 0; k <= MouthMesh.SEGMENTS; k++) {
			float dx = MOUTH.xs[k] - u;
			float dy = MOUTH.top[k] + MouthMesh.OUTLINE - v;
			best = Math.min(best, (float) Math.sqrt(dx * dx + dy * dy));
		}
		return best;
	}

	private static float smoothstep(float t) {
		return t * t * (3.0F - 2.0F * t);
	}

	private static void buildFace(MeshWriter w, FaceRenderData data, FaceAnchor anchor) {
		FacePose pose = data.pose;
		int segments = data.roundSegments();
		boolean googlyStyle = data.googly;
		float eyeSize = data.eyeSize;
		FaceLayout layout = LAYOUT;
		layout(data, anchor, layout);

		// ---------- Eyes ----------
		for (int i = 0; i < 2; i++) {
			float scale = Math.max(1.0F, pose.eyeScale[i]);
			boolean front = i == pose.frontEye;
			EYE.centerU = layout.eyeU[i];
			EYE.centerV = layout.eyeV[i];
			EYE.radius = layout.eyeRadius[i];
			EYE.base = anchor.eyeBase() + (front ? 0.06F : 0.0F);
			// Bigger eyes bulge out further; the front eye of an overlapping pair sticks out more.
			EYE.depth = anchor.eyeDepth() * (0.75F + 0.25F * eyeSize) * (float) Math.sqrt(scale) * (pose.spiral ? 1.1F : 1.0F)
				+ (front ? layout.frontPush : 0.0F);
			EYE.dome = anchor.domeHeight() * (0.8F + 0.2F * eyeSize) * (float) Math.pow(scale, 0.7);
			EYE.open = pose.eyeOpen[i];
			EYE.pupilX = pose.pupilX[i];
			EYE.pupilY = pose.pupilY[i];
			// Pupils grow less than the eyes, so wide eyes show more white.
			EYE.pupilFraction = 0.46F * data.pupilSize * pose.pupilScale * (googlyStyle ? 1.0F : 1.08F) / (float) Math.pow(scale, 0.45);
			EYE.spiral = pose.spiral;
			EYE.spiralAngle = pose.spiralAngle;
			EYE.spiralGrow = pose.spiralGrow;
			EYE.elmoStyle = !googlyStyle;
			EYE.build(w, segments);
		}

		// Highest point of the eyes and brows: the dizzy stars orbit above it.
		float featureTop = Math.max(layout.eyeTop[0], layout.eyeTop[1]);

		// ---------- Brows ----------
		if (data.showBrows) {
			for (int i = 0; i < 2; i++) {
				float side = i == 0 ? -1.0F : 1.0F;
				float lift = pose.browLift[i];
				float scale = Math.max(1.0F, pose.eyeScale[i]);
				// Brows grow when the face gets expressive (surprised, angry, dizzy...) and with the eyes.
				float expressive = Mth.clamp(Math.abs(lift) / 1.4F + Math.abs(pose.browAngle[i]) / 0.5F, 0.0F, 1.0F);
				float grow = (1.0F + 0.28F * expressive) * (float) Math.pow(scale, 0.6);
				float length = anchor.browLength() * data.browSize * (0.85F + 0.15F * eyeSize) * grow;
				float thickness = anchor.browThickness() * data.browSize * (1.0F + 0.35F * expressive) * (float) Math.pow(scale, 0.35);
				float v = layout.eyeTop[i] + anchor.browGap() * (0.85F + 0.15F * data.browSize) + lift;
				float u = layout.eyeU[i] + side * 0.2F * scale;
				float angle = (i == 0 ? -1.0F : 1.0F) * pose.browAngle[i];
				float arch = 0.32F + 0.22F * Math.max(0.0F, lift) * 0.6F;
				BROW.build(w, u, v, length, thickness, anchor.browFront() - anchor.browDepth(), anchor.browFront(), angle, arch, BrowMesh.DEFAULT_COLOR);
				featureTop = Math.max(featureTop, v + thickness + arch + length * 0.5F * Math.abs(Mth.sin(angle)));
			}
		}

		// ---------- Nose (Elmo) ----------
		if (data.elmo) {
			int lat = Math.max(6, segments / 3);
			int lon = Math.max(10, segments / 2 + 2);
			NoseMesh.build(w, 0.0F, anchor.noseY(), anchor.noseCenterW(), anchor.noseRadiusX(), anchor.noseRadiusY(), anchor.noseRadiusZ(), lat, lon);
		}

		// ---------- Mouth (outline already laid out) ----------
		MOUTH.draw(w, 0.0F, layout.mouthWidth, data.elmo ? 0.0F : pose.mouthTeeth, pose.mouthUvula,
			anchor.mouthFront(), anchor.mouthBack(), data.elmo);

		// ---------- Cartoon stars ----------
		if (pose.stars > 0.02F) {
			// Above the head, and above big eyes and brows (stars are up to 1.25 px big and bob 0.35 px).
			float topV = Math.max(anchor.halfHeight() + anchor.starsHeight(), featureTop + 1.75F);
			float centerW = -anchor.headHalfDepth();
			for (int i = 0; i < STAR_COUNT; i++) {
				float orbit = pose.starsAngle + i * Mth.TWO_PI / STAR_COUNT;
				float bob = Mth.sin(pose.time * 6.0F + i * 1.7F) * 0.35F;
				float twinkle = 1.0F + 0.12F * Mth.sin(pose.time * 9.0F + i * 2.3F);
				float radius = 1.25F * pose.stars * twinkle;
				STAR.build(w,
					anchor.starsOrbit() * Mth.cos(orbit), topV + bob, centerW + anchor.starsOrbit() * Mth.sin(orbit),
					orbit, radius, pose.time * 2.5F + i, 0.75F);
			}
		}
	}

	public static long builtFaces() {
		return builtFaces;
	}

	public static long buildNanos() {
		return buildNanos;
	}

	public static int lastQuadCount() {
		return lastQuadCount;
	}
}
