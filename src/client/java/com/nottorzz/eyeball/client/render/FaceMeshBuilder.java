package com.nottorzz.eyeball.client.render;

import com.nottorzz.eyeball.client.anim.FacePose;
import net.minecraft.util.Mth;

/**
 * Assembles a whole face (eyes, brows, mouth, nose, stars) from a {@link FaceRenderData}.
 * Runs on the render thread when the deferred geometry is drawn; the mesh helpers are reused.
 */
public final class FaceMeshBuilder {
	private static final int STAR_COUNT = 4;
	private static final EyeMesh EYE = new EyeMesh();
	private static final BrowMesh BROW = new BrowMesh();
	private static final MouthMesh MOUTH = new MouthMesh();
	private static final StarMesh STAR = new StarMesh();

	/** Quads emitted by the last {@link #build} call (for the performance test). */
	private static int lastQuadCount;

	private FaceMeshBuilder() {
	}

	public static void build(MeshWriter w, FaceRenderData data, FaceAnchor anchor) {
		FacePose pose = data.pose;
		int segments = data.roundSegments();
		boolean googlyStyle = data.googly;
		float eyeSize = data.eyeSize;

		// ---------- Eyes ----------
		int frontEye = pose.eyeScale[0] >= pose.eyeScale[1] ? 0 : 1;
		float[] eyeU = new float[2];
		float[] eyeTop = new float[2];
		for (int i = 0; i < 2; i++) {
			float side = i == 0 ? -1.0F : 1.0F;
			float baseRadius = anchor.eyeRadius() * eyeSize * (googlyStyle && data.elmo ? 1.08F : 1.0F);
			float radius = baseRadius * pose.eyeScale[i];
			float spacing = anchor.eyeSpacing() * data.eyeSpacing * (0.8F + 0.2F * eyeSize);
			float u = side * spacing;
			// Bigger eyes grow upwards a little so they do not swallow the mouth.
			float v = anchor.eyeY() + (radius - anchor.eyeRadius()) * 0.35F + pose.eyeBounce * (i == 0 ? 1.0F : 0.82F);
			eyeU[i] = u;
			eyeTop[i] = anchor.eyeY() + baseRadius * Math.max(1.0F, pose.eyeScale[i]) + (baseRadius - anchor.eyeRadius()) * 0.35F;

			EYE.centerU = u;
			EYE.centerV = v;
			EYE.radius = radius;
			EYE.base = anchor.eyeBase() + (i == frontEye ? 0.06F : 0.0F);
			EYE.depth = anchor.eyeDepth() * (0.75F + 0.25F * eyeSize) * (pose.spiral ? 1.1F : 1.0F);
			EYE.dome = anchor.domeHeight() * (0.8F + 0.2F * eyeSize);
			EYE.open = pose.eyeOpen[i];
			EYE.pupilX = pose.pupilX[i];
			EYE.pupilY = pose.pupilY[i];
			EYE.pupilFraction = 0.46F * data.pupilSize * pose.pupilScale * (googlyStyle ? 1.0F : 1.08F);
			EYE.spiral = pose.spiral;
			EYE.spiralAngle = pose.spiralAngle * (i == 0 ? 1.0F : 1.0F);
			EYE.spiralGrow = pose.spiralGrow;
			EYE.elmoStyle = !googlyStyle;
			EYE.build(w, segments);
		}

		// ---------- Brows ----------
		if (data.showBrows) {
			for (int i = 0; i < 2; i++) {
				float side = i == 0 ? -1.0F : 1.0F;
				float lift = pose.browLift[i];
				float length = anchor.browLength() * data.browSize * (0.85F + 0.15F * eyeSize);
				float thickness = anchor.browThickness() * data.browSize;
				float v = eyeTop[i] + anchor.browGap() * (0.85F + 0.15F * data.browSize) + lift;
				float u = eyeU[i] + side * 0.2F;
				float angle = (i == 0 ? -1.0F : 1.0F) * pose.browAngle[i];
				float arch = 0.32F + 0.22F * Math.max(0.0F, lift) * 0.6F;
				BROW.build(w, u, v, length, thickness, anchor.browFront() - anchor.browDepth(), anchor.browFront(), angle, arch, BrowMesh.DEFAULT_COLOR);
			}
		}

		// ---------- Nose (Elmo) ----------
		if (data.elmo) {
			int lat = Math.max(6, segments / 3);
			int lon = Math.max(10, segments / 2 + 2);
			NoseMesh.build(w, 0.0F, anchor.noseY(), anchor.noseCenterW(), anchor.noseRadiusX(), anchor.noseRadiusY(), anchor.noseRadiusZ(), lat, lon);
		}

		// ---------- Mouth ----------
		float width = anchor.mouthWidth() * data.mouthSize * pose.mouthWidth;
		float height = anchor.mouthHeight() * data.mouthSize;
		float open = pose.mouthOpen;
		float smile = pose.mouthSmile;
		float dShape = pose.mouthDShape;
		if (data.elmo) {
			// Elmo's big black half-moon mouth is always a little open.
			open = 0.3F + 0.7F * open;
			dShape = Math.max(dShape, 0.55F);
			smile = smile + 0.25F;
		}
		MOUTH.build(w, 0.0F, anchor.mouthY(), width, height, open, smile, dShape, data.elmo ? 0.0F : pose.mouthTeeth,
			anchor.mouthFront(), anchor.mouthBack(), data.elmo);

		// ---------- Cartoon stars ----------
		if (pose.stars > 0.02F) {
			float topV = anchor.halfHeight() + anchor.starsHeight();
			float centerW = -anchor.headHalfDepth();
			for (int i = 0; i < STAR_COUNT; i++) {
				float orbit = pose.starsAngle + i * Mth.TWO_PI / STAR_COUNT;
				float bob = Mth.sin(pose.time * 6.0F + i * 1.7F) * 0.35F;
				float twinkle = 1.0F + 0.12F * Mth.sin(pose.time * 9.0F + i * 2.3F);
				float radius = 1.25F * pose.stars * twinkle;
				STAR.build(w,
					anchor.starsOrbit() * Mth.cos(orbit), topV + bob, centerW + anchor.starsOrbit() * Mth.sin(orbit),
					orbit, radius, pose.time * 2.5F + i, 0.5F);
			}
		}
		lastQuadCount = w.quadCount();
	}

	public static int lastQuadCount() {
		return lastQuadCount;
	}
}
