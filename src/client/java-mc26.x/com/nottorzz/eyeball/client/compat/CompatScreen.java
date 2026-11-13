package com.nottorzz.eyeball.client.compat;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/** A screen that draws its own decorations through {@link Gfx}, on top of its widgets (Minecraft 26.x version). */
public abstract class CompatScreen extends Screen {
	protected CompatScreen(Component title) {
		super(title);
	}

	@Override
	public final void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
		super.extractRenderState(graphics, mouseX, mouseY, partialTick);
		this.drawScreen(new Gfx(graphics), mouseX, mouseY, partialTick);
	}

	protected abstract void drawScreen(Gfx g, int mouseX, int mouseY, float partialTick);
}
