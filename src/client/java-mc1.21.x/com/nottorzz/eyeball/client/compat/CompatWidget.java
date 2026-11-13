package com.nottorzz.eyeball.client.compat;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.network.chat.Component;

/** A widget drawn through {@link Gfx} (Minecraft 1.21.11 version). */
public abstract class CompatWidget extends AbstractWidget {
	protected CompatWidget(int x, int y, int width, int height, Component message) {
		super(x, y, width, height, message);
	}

	@Override
	protected final void renderWidget(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
		this.drawWidget(new Gfx(graphics), mouseX, mouseY, partialTick);
	}

	protected abstract void drawWidget(Gfx g, int mouseX, int mouseY, float partialTick);
}
