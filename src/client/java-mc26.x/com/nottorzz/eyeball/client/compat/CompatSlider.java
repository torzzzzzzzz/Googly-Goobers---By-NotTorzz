package com.nottorzz.eyeball.client.compat;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.AbstractSliderButton;
import net.minecraft.network.chat.Component;

/** A slider drawn through {@link Gfx} (Minecraft 26.x version). */
public abstract class CompatSlider extends AbstractSliderButton {
	protected CompatSlider(int x, int y, int width, int height, Component message, double value) {
		super(x, y, width, height, message, value);
	}

	@Override
	public final void extractWidgetRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
		this.drawWidget(new Gfx(graphics), mouseX, mouseY, partialTick);
		this.handleCursor(graphics);
	}

	protected abstract void drawWidget(Gfx g, int mouseX, int mouseY, float partialTick);
}
