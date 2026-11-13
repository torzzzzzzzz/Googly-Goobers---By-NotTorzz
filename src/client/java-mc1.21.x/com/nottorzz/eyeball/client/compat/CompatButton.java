package com.nottorzz.eyeball.client.compat;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractButton;
import net.minecraft.network.chat.Component;

/** A button drawn through {@link Gfx} (Minecraft 1.21.11 version). */
public abstract class CompatButton extends AbstractButton {
	protected CompatButton(int x, int y, int width, int height, Component message) {
		super(x, y, width, height, message);
	}

	@Override
	protected final void renderContents(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
		this.drawContents(new Gfx(graphics), mouseX, mouseY, partialTick);
	}

	protected abstract void drawContents(Gfx g, int mouseX, int mouseY, float partialTick);
}
