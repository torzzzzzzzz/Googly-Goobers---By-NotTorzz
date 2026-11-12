package com.nottorzz.eyeball.client.render.elmo;

import com.nottorzz.eyeball.EyeBallMod;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeDeformation;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;
import net.minecraft.client.model.player.PlayerModel;

/**
 * Original fluffy-monster model (Elmo-style). It keeps the player skeleton (same part names and
 * pivots as {@link PlayerModel}) so every vanilla animation, held item, armour piece and other
 * layer still lines up, but has cartoon proportions:
 * <ul>
 *     <li>an oversized, rounded head built from overlapping boxes (a "voxel ball") with a hair tuft,</li>
 *     <li>chunky fur: the same model is drawn again 3 times, slightly inflated, with sparser and
 *     sparser strand textures ("shell" fur), which gives a fuzzy silhouette at almost no cost.</li>
 * </ul>
 * Texture layout is 128 x 64 units; the actual PNGs are higher resolution for fine fur strands.
 */
public final class ElmoModel extends PlayerModel {
	public static final int TEXTURE_WIDTH = 128;
	public static final int TEXTURE_HEIGHT = 64;
	public static final ModelLayerLocation BASE_LAYER = new ModelLayerLocation(EyeBallMod.id("elmo"), "main");
	public static final float[] FUR_DILATION = {0.42F, 0.84F, 1.26F};
	public static final ModelLayerLocation[] FUR_LAYERS = {
		new ModelLayerLocation(EyeBallMod.id("elmo"), "fur_1"),
		new ModelLayerLocation(EyeBallMod.id("elmo"), "fur_2"),
		new ModelLayerLocation(EyeBallMod.id("elmo"), "fur_3")
	};

	public ElmoModel(ModelPart root) {
		super(root, false);
	}

	public static LayerDefinition createLayer(float dilation) {
		CubeDeformation d = new CubeDeformation(dilation);
		MeshDefinition mesh = new MeshDefinition();
		PartDefinition root = mesh.getRoot();

		PartDefinition head = root.addOrReplaceChild("head", CubeListBuilder.create()
				// A rounded 10-pixel head made from four overlapping boxes.
				.texOffs(0, 0).addBox(-4.5F, -9.5F, -4.5F, 9.0F, 9.0F, 9.0F, d)
				.texOffs(36, 0).addBox(-5.0F, -8.5F, -3.5F, 10.0F, 7.0F, 7.0F, d)
				.texOffs(70, 0).addBox(-3.5F, -10.0F, -3.5F, 7.0F, 10.0F, 7.0F, d)
				.texOffs(0, 18).addBox(-3.5F, -8.5F, -5.0F, 7.0F, 7.0F, 10.0F, d)
				// Tuft of hair on top.
				.texOffs(98, 0).addBox(-1.0F, -11.5F, -1.0F, 2.0F, 2.0F, 2.0F, d),
			PartPose.ZERO);
		head.addOrReplaceChild("hat", CubeListBuilder.create(), PartPose.ZERO);

		PartDefinition body = root.addOrReplaceChild("body", CubeListBuilder.create()
			.texOffs(34, 18).addBox(-4.0F, 0.0F, -2.0F, 8.0F, 12.0F, 4.0F, d), PartPose.ZERO);
		body.addOrReplaceChild("jacket", CubeListBuilder.create(), PartPose.ZERO);

		PartDefinition rightArm = root.addOrReplaceChild("right_arm", CubeListBuilder.create()
			.texOffs(58, 18).addBox(-3.0F, -2.0F, -2.0F, 4.0F, 12.0F, 4.0F, d), PartPose.offset(-5.0F, 2.0F, 0.0F));
		rightArm.addOrReplaceChild("right_sleeve", CubeListBuilder.create(), PartPose.ZERO);
		PartDefinition leftArm = root.addOrReplaceChild("left_arm", CubeListBuilder.create()
			.texOffs(58, 18).mirror().addBox(-1.0F, -2.0F, -2.0F, 4.0F, 12.0F, 4.0F, d), PartPose.offset(5.0F, 2.0F, 0.0F));
		leftArm.addOrReplaceChild("left_sleeve", CubeListBuilder.create(), PartPose.ZERO);

		PartDefinition rightLeg = root.addOrReplaceChild("right_leg", CubeListBuilder.create()
			.texOffs(74, 18).addBox(-2.0F, 0.0F, -2.0F, 4.0F, 12.0F, 4.0F, d), PartPose.offset(-1.9F, 12.0F, 0.0F));
		rightLeg.addOrReplaceChild("right_pants", CubeListBuilder.create(), PartPose.ZERO);
		PartDefinition leftLeg = root.addOrReplaceChild("left_leg", CubeListBuilder.create()
			.texOffs(74, 18).mirror().addBox(-2.0F, 0.0F, -2.0F, 4.0F, 12.0F, 4.0F, d), PartPose.offset(1.9F, 12.0F, 0.0F));
		leftLeg.addOrReplaceChild("left_pants", CubeListBuilder.create(), PartPose.ZERO);

		return LayerDefinition.create(mesh, TEXTURE_WIDTH, TEXTURE_HEIGHT);
	}
}
