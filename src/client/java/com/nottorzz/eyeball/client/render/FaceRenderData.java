package com.nottorzz.eyeball.client.render;

import com.nottorzz.eyeball.Appearance;
import com.nottorzz.eyeball.client.anim.FacePose;
import com.nottorzz.eyeball.client.config.EyeBallConfig;
import net.fabricmc.fabric.api.client.rendering.v1.RenderStateDataKey;

/**
 * Everything the renderer needs for one face in one frame, attached to the player's
 * {@code AvatarRenderState}. Immutable after creation because 26.x renders entities later in the
 * frame than they are extracted.
 */
public final class FaceRenderData {
	public static final RenderStateDataKey<FaceRenderData> KEY = RenderStateDataKey.create(() -> "eyeball:face");

	public final boolean googly;
	public final boolean showBrows;
	public final FacePose pose;
	public final float eyeSize;
	public final float pupilSize;
	public final float mouthSize;
	public final float browSize;
	public final float eyeSpacing;
	public final float characterSize;
	/** Squared distance to the camera, for level of detail. */
	public final double distanceSq;

	public FaceRenderData(int flags, FacePose pose, EyeBallConfig config, double distanceSq) {
		this.googly = Appearance.googly(flags);
		this.showBrows = config.eyebrows && this.googly;
		this.pose = pose;
		this.eyeSize = config.eyeSize;
		this.pupilSize = config.pupilSize;
		this.mouthSize = config.mouthSize;
		this.browSize = config.eyebrowSize;
		this.eyeSpacing = config.eyeSpacing;
		this.characterSize = config.characterSize;
		this.distanceSq = distanceSq;
	}

	/** Segments used for round shapes: fewer for faces far away. */
	public int roundSegments() {
		if (this.distanceSq < 16.0 * 16.0) {
			return 28;
		}
		if (this.distanceSq < 40.0 * 40.0) {
			return 18;
		}
		return 12;
	}
}
