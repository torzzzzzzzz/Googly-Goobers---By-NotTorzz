package com.nottorzz.eyeball.client.gui;

import com.nottorzz.eyeball.Appearance;
import com.nottorzz.eyeball.client.compat.CompatList;
import com.nottorzz.eyeball.client.compat.CompatScreen;
import com.nottorzz.eyeball.client.compat.Gfx;
import com.nottorzz.eyeball.client.compat.McCompat;
import com.nottorzz.eyeball.client.config.ConfigManager;
import com.nottorzz.eyeball.client.config.EyeBallConfig;
import com.nottorzz.eyeball.client.gui.widget.GuiDraw;
import com.nottorzz.eyeball.client.gui.widget.ToggleSwitch;
import com.nottorzz.eyeball.client.target.TargetResolver;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.narration.NarratableEntry;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.network.chat.CommonComponents;
import net.minecraft.network.chat.Component;
import org.jspecify.annotations.Nullable;

/**
 * Pick exactly who gets googly eyes on your screen. Each row shows the player's current state;
 * flipping the switch stores a choice for that player that overrides "Apply to Myself / Apply to
 * Everyone". The arrow button forgets the choice again.
 */
public final class PlayerSelectionScreen extends CompatScreen {
	private static final int SWITCH_WIDTH = 46;
	private final @Nullable Screen parent;
	private @Nullable EditBox search;
	private @Nullable PlayerList list;
	private String filter = "";

	public PlayerSelectionScreen(@Nullable Screen parent) {
		super(Component.translatable("eyeball.players.title"));
		this.parent = parent;
	}

	@Override
	protected void init() {
		int listWidth = Math.min(380, this.width - 16);
		int left = (this.width - listWidth) / 2;
		this.search = new EditBox(this.font, left, 30, listWidth - 120, 18, Component.translatable("eyeball.players.search"));
		this.search.setHint(Component.translatable("eyeball.players.search"));
		this.search.setValue(this.filter);
		this.search.setResponder(value -> {
			this.filter = value;
			this.refreshList();
		});
		this.addRenderableWidget(this.search);
		this.addRenderableWidget(Button.builder(Component.translatable("eyeball.players.clear_all"), button -> {
			ConfigManager.get().playerOverrides.clear();
			ConfigManager.notifyChanged();
		}).bounds(left + listWidth - 114, 29, 114, 20).build());

		int top = 66;
		this.list = new PlayerList(this.minecraft, listWidth, this.height - top - 40, top);
		this.list.setX(left);
		this.addRenderableWidget(this.list);
		this.addRenderableWidget(Button.builder(CommonComponents.GUI_DONE, button -> this.onClose())
			.bounds(this.width / 2 - 75, this.height - 28, 150, 20).build());
		this.refreshList();
	}

	private void refreshList() {
		if (this.list == null) {
			return;
		}
		List<PlayerRow> rows = new ArrayList<>();
		ClientPacketListener connection = this.minecraft.getConnection();
		if (connection != null) {
			UUID self = this.minecraft.player != null ? this.minecraft.player.getUUID() : null;
			String needle = this.filter.toLowerCase(Locale.ROOT).strip();
			List<PlayerInfo> players = new ArrayList<>(connection.getOnlinePlayers());
			players.sort(Comparator.comparing((PlayerInfo info) -> !info.getProfile().id().equals(self))
				.thenComparing(info -> info.getProfile().name().toLowerCase(Locale.ROOT)));
			for (PlayerInfo info : players) {
				if (needle.isEmpty() || info.getProfile().name().toLowerCase(Locale.ROOT).contains(needle)) {
					rows.add(new PlayerRow(info, info.getProfile().id().equals(self)));
				}
			}
		}
		this.list.setRows(rows);
	}

	@Override
	protected void drawScreen(Gfx g, int mouseX, int mouseY, float a) {
		g.centeredText(this.font, this.title.copy().withStyle(style -> style.withBold(true)), this.width / 2, 8, GuiDraw.ACCENT);
		g.centeredText(this.font, Component.translatable("eyeball.players.hint"), this.width / 2, 18, GuiDraw.TEXT_DIM);
		if (this.list != null) {
			// Column header above the switches (same geometry as the rows).
			int right = this.list.getRowRight() - 2;
			int headerY = this.list.getY() - 12;
			g.centeredText(this.font, Component.translatable("eyeball.players.column"), right - 24 - SWITCH_WIDTH / 2, headerY, GuiDraw.TEXT_DIM);
		}
		if (this.list != null && this.list.children().isEmpty()) {
			Component message = this.minecraft.getConnection() == null
				? Component.translatable("eyeball.players.no_world")
				: Component.translatable("eyeball.players.none");
			g.centeredText(this.font, message, this.width / 2, this.list.getY() + 20, GuiDraw.TEXT_DIM);
		}
	}

	@Override
	public void onClose() {
		ConfigManager.save();
		ConfigManager.notifyChanged();
		McCompat.setScreen(this.minecraft, this.parent);
	}

	/** For tests: number of listed players. */
	public int rowCount() {
		return this.list == null ? 0 : this.list.children().size();
	}

	/** For tests: flip one player's switch the way a click would. */
	public void clickToggle(UUID player) {
		if (this.list == null) {
			return;
		}
		for (PlayerRow row : this.list.children()) {
			if (row.id.equals(player)) {
				row.googlySwitch.onPress(null);
			}
		}
	}

	private static final class PlayerList extends CompatList<PlayerRow> {
		PlayerList(Minecraft minecraft, int width, int height, int y) {
			super(minecraft, width, height, y, 24);
			this.centerListVertically = false;
		}

		void setRows(List<PlayerRow> rows) {
			this.replaceEntries(rows);
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
	}

	private static final class PlayerRow extends CompatList.Entry<PlayerRow> {
		private final PlayerInfo info;
		private final UUID id;
		private final String name;
		private final boolean self;
		private final ToggleSwitch googlySwitch;
		private final Button resetButton;

		PlayerRow(PlayerInfo info, boolean self) {
			this.info = info;
			this.id = info.getProfile().id();
			this.name = info.getProfile().name();
			this.self = self;
			this.googlySwitch = new ToggleSwitch(0, 0, SWITCH_WIDTH, 20, Component.empty(),
				() -> Appearance.googly(TargetResolver.resolve(this.id, this.self)),
				this::choose,
				Component.translatable("eyeball.option.googly_eyes").append(": " + this.name));
			this.resetButton = Button.builder(Component.literal("↺"), button -> {
				ConfigManager.get().clearOverride(this.id);
				ConfigManager.notifyChanged();
			}).bounds(0, 0, 20, 20).tooltip(Tooltip.create(Component.translatable("eyeball.players.reset_row"))).build();
		}

		private void choose(boolean value) {
			EyeBallConfig config = ConfigManager.get();
			boolean baseValue = Appearance.googly(TargetResolver.resolve(this.id, this.self, false));
			if (value == baseValue) {
				// Same as the global setting: no need to remember a choice.
				config.clearOverride(this.id);
			} else {
				config.getOrCreateOverride(this.id, this.name).googly = value;
			}
			ConfigManager.notifyChanged();
		}

		@Override
		public void drawContent(Gfx g, int mouseX, int mouseY, boolean hovered, float a) {
			EyeBallConfig config = ConfigManager.get();
			var font = Minecraft.getInstance().font;
			int x = this.getContentX();
			int y = this.getContentY();
			int h = this.getContentHeight();
			if (hovered) {
				GuiDraw.roundedRect(g, x, y, this.getContentWidth(), h, 3, GuiDraw.ROW_HOVER);
			}
			g.playerFace(this.info.getSkin(), x + 4, y + (h - 12) / 2, 12);
			int textX = x + 22;
			g.text(font, this.name, textX, y + (h - 8) / 2, GuiDraw.TEXT, true);
			int after = textX + font.width(this.name) + 4;
			if (this.self) {
				g.text(font, Component.translatable("eyeball.players.you"), after, y + (h - 8) / 2, GuiDraw.ACCENT, false);
				after += font.width(Component.translatable("eyeball.players.you")) + 4;
			}
			boolean custom = config.override(this.id) != null;
			if (custom) {
				g.text(font, Component.translatable("eyeball.players.custom"), after, y + (h - 8) / 2, 0xFF8FB8FF, false);
			}
			int right = this.getContentRight();
			this.resetButton.visible = custom;
			this.resetButton.setX(right - 20);
			this.resetButton.setY(y);
			this.googlySwitch.setX(right - 24 - SWITCH_WIDTH);
			this.googlySwitch.setY(y);
			this.googlySwitch.active = config.googlyEyes;
			g.widget(this.googlySwitch, mouseX, mouseY, a);
			g.widget(this.resetButton, mouseX, mouseY, a);
		}

		@Override
		public List<? extends GuiEventListener> children() {
			return List.of(this.googlySwitch, this.resetButton);
		}

		@Override
		public List<? extends NarratableEntry> narratables() {
			return List.of(this.googlySwitch, this.resetButton);
		}
	}
}
