package com.nottorzz.eyeball.client.render;

/**
 * Where facial features sit on a head model, in model pixels.
 * <p>
 * Face space has its origin on the front of the head at {@code (0, headCenterY, frontZ)} in model
 * space, with u = +x, v = up (model -y) and w = out of the face (model -z).
 * <p>
 * The last four values lay out a face whose features grow (talking, screaming): eyes swell mostly
 * upwards and outwards ({@code eyeGrowUp}, {@code eyeGrowOut} per pixel of extra radius), the mouth
 * never hangs below {@code chinLimit}, and the eyes keep at least {@code featureGap} away from a
 * wide-open mouth.
 */
public record FaceAnchor(
	float headCenterY,
	float frontZ,
	float halfWidth,
	float halfHeight,
	float headHalfDepth,
	float eyeY,
	float eyeSpacing,
	float eyeRadius,
	float eyeBase,
	float eyeDepth,
	float domeHeight,
	float browGap,
	float browLength,
	float browThickness,
	float browDepth,
	float browFront,
	float mouthY,
	float mouthWidth,
	float mouthHeight,
	float mouthFront,
	float mouthBack,
	float starsHeight,
	float starsOrbit,
	float eyeGrowUp,
	float eyeGrowOut,
	float chinLimit,
	float featureGap
) {
	/** The standard 8x8x8 player head. */
	public static final FaceAnchor PLAYER = new FaceAnchor(
		-4.0F, -4.0F, 4.0F, 4.0F, 4.0F,
		// eyes: height, spacing, radius, base, cylinder depth, dome
		1.0F, 2.4F, 2.55F, -0.15F, 1.45F, 0.6F,
		// brows: gap above eye, length, thickness, depth, front
		0.85F, 3.7F, 0.9F, 0.55F, 0.8F,
		// mouth: height, width, max open height (a screaming mouth), front (in front of the hat layer), back
		-2.55F, 4.3F, 4.8F, 0.62F, -0.05F,
		// stars: height above head top, orbit radius
		1.7F, 5.6F,
		// growing features: eyes up / out per pixel of growth, lowest mouth point, eye-mouth gap
		0.8F, 0.55F, -4.3F, 0.3F
	);

}
