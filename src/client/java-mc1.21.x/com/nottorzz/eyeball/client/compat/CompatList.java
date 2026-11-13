package com.nottorzz.eyeball.client.compat;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.ContainerObjectSelectionList;

/**
 * A scrolling list of widget rows drawn through {@link Gfx}, with a custom background and no
 * separators (Minecraft 1.21.11 version).
 */
public abstract class CompatList<E extends CompatList.Entry<E>> extends ContainerObjectSelectionList<E> {
	protected CompatList(Minecraft minecraft, int width, int height, int y, int itemHeight) {
		super(minecraft, width, height, y, itemHeight);
	}

	@Override
	protected final void renderListBackground(GuiGraphics graphics) {
		this.drawListBackground(new Gfx(graphics));
	}

	@Override
	protected final void renderListSeparators(GuiGraphics graphics) {
	}

	protected abstract void drawListBackground(Gfx g);

	public abstract static class Entry<E extends Entry<E>> extends ContainerObjectSelectionList.Entry<E> {
		@Override
		public final void renderContent(GuiGraphics graphics, int mouseX, int mouseY, boolean hovered, float partialTick) {
			this.drawContent(new Gfx(graphics), mouseX, mouseY, hovered, partialTick);
		}

		public abstract void drawContent(Gfx g, int mouseX, int mouseY, boolean hovered, float partialTick);
	}
}
