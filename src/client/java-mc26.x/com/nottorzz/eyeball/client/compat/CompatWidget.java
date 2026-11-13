package com.nottorzz.eyeball.client.compat;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.network.chat.Component;

/** A widget drawn through {@link Gfx} (Minecraft 26.x version). */
public abstract class CompatWidget extends AbstractWidget {
	protected CompatWidget(int x, int y, int width, int height, Component message) {
		super(x, y, width, height, message);
	}

	@Override
	protected final void extractWidgetRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
		this.drawWidget(new Gfx(graphics), mouseX, mouseY, partialTick);
	}

	protected abstract void drawWidget(Gfx g, int mouseX, int mouseY, float partialTick);
}
