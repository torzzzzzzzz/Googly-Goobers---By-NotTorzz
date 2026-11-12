package com.nottorzz.eyeball.client.gui.widget;

import com.mojang.authlib.GameProfile;
import com.nottorzz.eyeball.client.config.ConfigManager;
import com.nottorzz.eyeball.client.config.EyeBallConfig;
import com.nottorzz.eyeball.client.gui.PreviewController;
import com.nottorzz.eyeball.client.render.FaceRenderData;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.narration.NarratedElementType;
import net.minecraft.client.gui.narration.NarrationElementOutput;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.resources.DefaultPlayerSkin;
import net.minecraft.client.sounds.SoundManager;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.Pose;
import net.minecraft.world.entity.player.PlayerSkin;
import org.joml.Quaternionf;
import org.joml.Vector3f;
import org.jspecify.annotations.Nullable;

/**
 * The live character preview. Shows your own skin (or the default skin on the title screen) with
 * the previewed effect, rendered by the real game renderers, so it looks exactly like in-game.
 * Drag to rotate, scroll to zoom from full body to a face close-up.
 */
public final class PreviewPanel extends AbstractWidget {
	private final PreviewController controller;
	private float yaw = -22.0F;
	private float pitch = 6.0F;
	private float zoom = 0.1F;
	private float shownZoom = 0.1F;
	private @Nullable CompletableFuture<Optional<PlayerSkin>> skinLookup;
	private final AvatarRenderState menuState = new AvatarRenderState();

	public PreviewPanel(int x, int y, int width, int height, PreviewController controller) {
		super(x, y, width, height, Component.translatable("eyeball.menu.preview"));
		this.controller = controller;
	}

	@Override
	protected void extractWidgetRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float partialTick) {
		int x = this.getX();
		int y = this.getY();
		int w = this.getWidth();
		int h = this.getHeight();
		GuiDraw.panel(g, x, y, w, h);
		g.fillGradient(x + 2, y + 2, x + w - 2, y + h - 2, 0x30FFC23D, 0x10000000);

		EyeBallConfig config = ConfigManager.get();
		AvatarRenderState state = this.buildState(partialTick);
		state.setData(FaceRenderData.KEY, this.controller.renderData(partialTick, config));

		this.shownZoom += (this.zoom - this.shownZoom) * 0.2F;
		boolean elmo = this.controller.mode().elmo;
		// Framed with room above the head: talking and screaming eyes grow far above it.
		float fullScale = elmo ? h / 3.3F : h / 3.0F;
		float faceScale = elmo ? h / 1.45F : h / 1.2F;
		float scale = Mth.lerp(this.shownZoom, fullScale, faceScale);
		float headCenter = elmo ? 1.92F : 1.74F;
		float centerY = Mth.lerp(this.shownZoom, elmo ? 1.45F : 1.3F, headCenter);
		Quaternionf rotation = new Quaternionf().rotateZ(Mth.PI).rotateX(this.pitch * Mth.DEG_TO_RAD);
		Quaternionf camera = new Quaternionf().rotateX(this.pitch * Mth.DEG_TO_RAD);
		g.entity(state, scale, new Vector3f(0.0F, centerY, 0.0F), rotation, camera, x + 2, y + 2, x + w - 2, y + h - 2);

		var font = Minecraft.getInstance().font;
		Component hint = Component.translatable("eyeball.menu.preview.hint");
		int hintWidth = Math.min(font.width(hint) + 8, w - 4);
		GuiDraw.roundedRect(g, x + (w - hintWidth) / 2, y + h - 13, hintWidth, 11, 3, 0x90101014);
		g.centeredText(font, hint, x + w / 2, y + h - 11, 0xDDFFFFFF);
		Component label = this.controller.mode().label();
		int labelWidth = font.width(label);
		GuiDraw.roundedRect(g, x + 4, y + 4, labelWidth + 8, 12, 3, 0xA0101014);
		g.text(font, label, x + 8, y + 6, GuiDraw.ACCENT, false);
		if (this.controller.mode().isHit() && !config.hitReactions) {
			g.centeredText(font, Component.translatable("eyeball.menu.preview.reactions_off"), x + w / 2, y + 18, 0xFFFF8080);
		}
	}

	private AvatarRenderState buildState(float partialTick) {
		Minecraft minecraft = Minecraft.getInstance();
		AvatarRenderState state = null;
		if (minecraft.player != null) {
			EntityRenderState extracted = minecraft.getEntityRenderDispatcher().extractEntity(minecraft.player, 1.0F);
			if (extracted instanceof AvatarRenderState avatar) {
				state = avatar;
			}
		}
		if (state == null) {
			state = this.menuState;
			state.entityType = EntityTypes.PLAYER;
			state.skin = this.menuSkin(minecraft);
			state.boundingBoxWidth = 0.6F;
			state.boundingBoxHeight = 1.8F;
			state.eyeHeight = 1.62F;
		}
		state.shadowPieces.clear();
		state.outlineColor = 0;
		state.nameTag = null;
		state.scoreText = null;
		state.isInvisible = false;
		state.isInvisibleToPlayer = false;
		state.hasRedOverlay = false;
		state.deathTime = 0.0F;
		state.pose = Pose.STANDING;
		state.isCrouching = false;
		state.swimAmount = 0.0F;
		state.isFallFlying = false;
		state.isAutoSpinAttack = false;
		state.isPassenger = false;
		state.walkAnimationSpeed = 0.0F;
		state.walkAnimationPos = 0.0F;
		state.scale = 1.0F;
		state.bodyRot = 180.0F + this.yaw;
		state.yRot = this.controller.headYaw() * 0.55F;
		state.xRot = this.controller.headPitch() * 0.5F;
		state.ageInTicks = this.controller.age() + partialTick;
		return state;
	}

	private PlayerSkin menuSkin(Minecraft minecraft) {
		GameProfile profile = minecraft.getGameProfile();
		if (this.skinLookup == null) {
			try {
				this.skinLookup = minecraft.getSkinManager().get(profile);
			} catch (RuntimeException e) {
				this.skinLookup = CompletableFuture.completedFuture(Optional.empty());
			}
		}
		Optional<PlayerSkin> skin = this.skinLookup.isDone() ? this.skinLookup.getNow(Optional.empty()) : Optional.empty();
		return skin.orElseGet(() -> DefaultPlayerSkin.get(profile));
	}

	@Override
	public void onClick(MouseButtonEvent event, boolean doubleClick) {
	}

	@Override
	protected void onDrag(MouseButtonEvent event, double dx, double dy) {
		this.yaw -= (float) dx * 1.6F;
		this.pitch = Mth.clamp(this.pitch - (float) dy * 1.2F, -35.0F, 35.0F);
	}

	@Override
	public boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY) {
		this.zoom = Mth.clamp(this.zoom + (float) scrollY * 0.2F, 0.0F, 1.0F);
		return true;
	}

	@Override
	public void playDownSound(SoundManager soundManager) {
	}

	public void setZoom(float zoom) {
		this.zoom = Mth.clamp(zoom, 0.0F, 1.0F);
		this.shownZoom = this.zoom;
	}

	public void setYaw(float yaw) {
		this.yaw = yaw;
	}

	@Override
	protected void updateWidgetNarration(NarrationElementOutput output) {
		output.add(NarratedElementType.TITLE, Component.empty().append(this.getMessage()).append(": ").append(this.controller.mode().label()));
	}
}
