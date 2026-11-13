package com.nottorzz.eyeball.client.gui.widget;

import com.nottorzz.eyeball.client.compat.CompatList;
import com.nottorzz.eyeball.client.compat.Gfx;
import java.util.ArrayList;
import java.util.List;
import java.util.function.IntSupplier;
import java.util.function.Supplier;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.narration.NarratableEntry;
import net.minecraft.network.chat.Component;

/**
 * The scrolling settings column: section headers, full-width switches and sliders, buttons and
 * status lines. Drawn as a rounded dark panel.
 */
public final class SettingsList extends CompatList<SettingsList.Row> {
	public static final int ROW_HEIGHT = 22;
	public static final int HEADER_HEIGHT = 20;

	public SettingsList(Minecraft minecraft, int width, int height, int y) {
		super(minecraft, width, height, y, ROW_HEIGHT);
		this.centerListVertically = false;
	}

	@Override
	public int getRowWidth() {
		return this.getWidth() - 16;
	}

	@Override
	protected int scrollBarX() {
		return this.getRight() - 7;
	}

	@Override
	protected void drawListBackground(Gfx g) {
		GuiDraw.panel(g, this.getX(), this.getY() - 2, this.getWidth(), this.getHeight() + 4);
	}

	public void addSection(Component title) {
		this.addEntry(new SectionRow(title), HEADER_HEIGHT);
	}

	public <W extends AbstractWidget> W addWidget(W widget) {
		this.addEntry(new WidgetRow(widget), ROW_HEIGHT);
		return widget;
	}

	public void addInfo(Supplier<Component> text, IntSupplier color) {
		this.addEntry(new InfoRow(text, color), 14);
	}

	/** Scrolls so the row holding {@code widget} sits {@code margin} pixels below the top of the list. */
	public void scrollToWidget(AbstractWidget widget, int margin) {
		for (Row row : this.children()) {
			if (row.children().contains(widget)) {
				this.setScrollAmount(this.scrollAmount() + row.getY() - this.getY() - margin);
				return;
			}
		}
	}

	/** All interactive widgets, for refreshing after a reset. */
	public List<AbstractWidget> allWidgets() {
		List<AbstractWidget> widgets = new ArrayList<>();
		for (Row row : this.children()) {
			for (GuiEventListener child : row.children()) {
				if (child instanceof AbstractWidget widget) {
					widgets.add(widget);
				}
			}
		}
		return widgets;
	}

	public abstract static class Row extends CompatList.Entry<Row> {
	}

	private static final class SectionRow extends Row {
		private final Component title;

		SectionRow(Component title) {
			this.title = title;
		}

		@Override
		public void drawContent(Gfx g, int mouseX, int mouseY, boolean hovered, float a) {
			var font = Minecraft.getInstance().font;
			int x = this.getContentX();
			int y = this.getContentY() + this.getContentHeight() - 11;
			g.fill(x + 2, y, x + 5, y + 9, GuiDraw.ACCENT);
			g.text(font, this.title.copy().withStyle(style -> style.withBold(true)), x + 9, y + 1, GuiDraw.ACCENT, true);
			int lineX = x + 14 + font.width(this.title) + 6;
			if (lineX < this.getContentRight() - 4) {
				g.fill(lineX, y + 5, this.getContentRight() - 4, y + 6, 0x40FFC23D);
			}
		}

		@Override
		public List<? extends GuiEventListener> children() {
			return List.of();
		}

		@Override
		public List<? extends NarratableEntry> narratables() {
			return List.of();
		}
	}

	private static final class WidgetRow extends Row {
		private final AbstractWidget widget;

		WidgetRow(AbstractWidget widget) {
			this.widget = widget;
		}

		@Override
		public void drawContent(Gfx g, int mouseX, int mouseY, boolean hovered, float a) {
			this.widget.setX(this.getContentX());
			this.widget.setY(this.getContentY());
			this.widget.setWidth(this.getContentWidth());
			g.widget(this.widget, mouseX, mouseY, a);
		}

		@Override
		public List<? extends GuiEventListener> children() {
			return List.of(this.widget);
		}

		@Override
		public List<? extends NarratableEntry> narratables() {
			return List.of(this.widget);
		}
	}

	private static final class InfoRow extends Row {
		private final Supplier<Component> text;
		private final IntSupplier color;

		InfoRow(Supplier<Component> text, IntSupplier color) {
			this.text = text;
			this.color = color;
		}

		@Override
		public void drawContent(Gfx g, int mouseX, int mouseY, boolean hovered, float a) {
			var font = Minecraft.getInstance().font;
			Component line = this.text.get();
			int maxWidth = this.getContentWidth() - 12;
			String shown = font.plainSubstrByWidth(line.getString(), maxWidth);
			g.text(font, shown, this.getContentX() + 6, this.getContentY() + 1, this.color.getAsInt(), false);
		}

		@Override
		public List<? extends GuiEventListener> children() {
			return List.of();
		}

		@Override
		public List<? extends NarratableEntry> narratables() {
			return List.of();
		}
	}
}
