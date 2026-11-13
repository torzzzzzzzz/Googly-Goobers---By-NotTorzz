package com.nottorzz.eyeball.client.compat;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.PlayerFaceRenderer;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.player.PlayerSkin;
import org.joml.Matrix3x2fStack;
import org.joml.Quaternionf;
import org.joml.Vector3f;
import org.jspecify.annotations.Nullable;

/**
 * The GUI drawing calls the menu uses, so the menu code is the same for every Minecraft version
 * (Minecraft 1.21.11 version: wraps {@link GuiGraphics}).
 */
public final class Gfx {
	private final GuiGraphics graphics;

	public Gfx(GuiGraphics graphics) {
		this.graphics = graphics;
	}

	public void fill(int x0, int y0, int x1, int y1, int color) {
		this.graphics.fill(x0, y0, x1, y1, color);
	}

	public void fillGradient(int x0, int y0, int x1, int y1, int topColor, int bottomColor) {
		this.graphics.fillGradient(x0, y0, x1, y1, topColor, bottomColor);
	}

	public void text(Font font, Component text, int x, int y, int color, boolean shadow) {
		this.graphics.drawString(font, text, x, y, color, shadow);
	}

	public void text(Font font, String text, int x, int y, int color, boolean shadow) {
		this.graphics.drawString(font, text, x, y, color, shadow);
	}

	public void centeredText(Font font, Component text, int x, int y, int color) {
		this.graphics.drawCenteredString(font, text, x, y, color);
	}

	public void centeredText(Font font, String text, int x, int y, int color) {
		this.graphics.drawCenteredString(font, text, x, y, color);
	}

	/** Draws a whole texture scaled into the given rectangle. */
	public void blitTexture(Identifier texture, int x, int y, int width, int height) {
		this.graphics.blit(RenderPipelines.GUI_TEXTURED, texture, x, y, 0.0F, 0.0F, width, height, width, height);
	}

	public Matrix3x2fStack pose() {
		return this.graphics.pose();
	}

	/** Renders an entity render state inside a GUI rectangle (like the inventory player). */
	public void entity(EntityRenderState state, float scale, Vector3f translation, Quaternionf rotation, @Nullable Quaternionf camera,
					   int x0, int y0, int x1, int y1) {
		this.graphics.submitEntityRenderState(state, scale, translation, rotation, camera, x0, y0, x1, y1);
	}

	public void playerFace(PlayerSkin skin, int x, int y, int size) {
		PlayerFaceRenderer.draw(this.graphics, skin, x, y, size);
	}

	/** Draws a child widget (used by list rows that host widgets). */
	public void widget(AbstractWidget widget, int mouseX, int mouseY, float partialTick) {
		widget.render(this.graphics, mouseX, mouseY, partialTick);
	}

}
