package com.nottorzz.eyeball.client.render.elmo;

import com.mojang.blaze3d.vertex.PoseStack;
import com.nottorzz.eyeball.EyeBallMod;
import com.nottorzz.eyeball.client.render.FaceRenderLayer;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.Identifier;

/**
 * Renders a transformed player as the fluffy red Elmo-style character. It is a normal player
 * renderer (so armour, held items, capes, arrows, elytra etc. all still work) with the model and
 * texture swapped, fur shells added, and the cartoon face (googly eyes, orange nose, big mouth).
 * In first person your arms become red and furry too.
 */
public final class ElmoRenderer extends AvatarRenderer<AbstractClientPlayer> {
	public static final Identifier TEXTURE = EyeBallMod.id("textures/entity/elmo/elmo_base.png");
	public static final Identifier[] FUR_TEXTURES = {
		EyeBallMod.id("textures/entity/elmo/elmo_fur_1.png"),
		EyeBallMod.id("textures/entity/elmo/elmo_fur_2.png"),
		EyeBallMod.id("textures/entity/elmo/elmo_fur_3.png")
	};

	private final ElmoModel[] shells;

	public ElmoRenderer(EntityRendererProvider.Context context) {
		super(context, false);
		this.model = new ElmoModel(context.bakeLayer(ElmoModel.BASE_LAYER));
		this.shells = new ElmoModel[ElmoModel.FUR_LAYERS.length];
		for (int i = 0; i < this.shells.length; i++) {
			this.shells[i] = new ElmoModel(context.bakeLayer(ElmoModel.FUR_LAYERS[i]));
		}
		this.addLayer(new ElmoFurLayer(this, this.shells));
		this.addLayer(new FaceRenderLayer(this));
	}

	@Override
	public Identifier getTextureLocation(AvatarRenderState state) {
		return TEXTURE;
	}

	@Override
	public void renderRightHand(PoseStack poseStack, SubmitNodeCollector collector, int lightCoords, Identifier skinTexture, boolean hasSleeve) {
		super.renderRightHand(poseStack, collector, lightCoords, TEXTURE, false);
		this.renderFurArm(poseStack, collector, lightCoords, true);
	}

	@Override
	public void renderLeftHand(PoseStack poseStack, SubmitNodeCollector collector, int lightCoords, Identifier skinTexture, boolean hasSleeve) {
		super.renderLeftHand(poseStack, collector, lightCoords, TEXTURE, false);
		this.renderFurArm(poseStack, collector, lightCoords, false);
	}

	private void renderFurArm(PoseStack poseStack, SubmitNodeCollector collector, int lightCoords, boolean right) {
		ModelPart baseArm = right ? this.getModel().rightArm : this.getModel().leftArm;
		for (int i = 0; i < this.shells.length; i++) {
			ModelPart arm = right ? this.shells[i].rightArm : this.shells[i].leftArm;
			arm.loadPose(baseArm.storePose());
			arm.visible = true;
			collector.submitModelPart(arm, poseStack, RenderTypes.entityCutout(FUR_TEXTURES[i]), lightCoords, OverlayTexture.NO_OVERLAY, null);
		}
	}
}
