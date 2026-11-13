package com.nottorzz.eyeball.client.input;

import com.mojang.blaze3d.platform.InputConstants;
import com.nottorzz.eyeball.EyeBallMod;
import com.nottorzz.eyeball.Expression;
import com.nottorzz.eyeball.FaceEventKind;
import com.nottorzz.eyeball.client.anim.FaceAnimationManager;
import com.nottorzz.eyeball.client.compat.McCompat;
import com.nottorzz.eyeball.client.config.ConfigManager;
import com.nottorzz.eyeball.client.config.EyeBallConfig;
import com.nottorzz.eyeball.client.gui.EyeBallConfigScreen;
import com.nottorzz.eyeball.client.network.ClientSync;
import java.util.EnumMap;
import java.util.Map;
import net.minecraft.ChatFormatting;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;

/**
 * Key bindings (Options > Controls > Key Binds > Googly Goobers):
 * <ul>
 *     <li>G - open the Googly Goobers menu</li>
 *     <li>unbound by default - toggle Googly Eyes, and one key per expression</li>
 * </ul>
 */
public final class EyeBallKeys {
	public static final KeyMapping.Category CATEGORY = KeyMapping.Category.register(EyeBallMod.id("controls"));
	private static final int EXPRESSION_TICKS = 60;
	private static final Expression[] EXPRESSIONS = {
		Expression.SURPRISED, Expression.ANGRY, Expression.LAUGHING, Expression.EXCITED, Expression.HAPPY, Expression.CONFUSED,
		Expression.SCREAMING
	};

	private static KeyMapping openMenu;
	private static KeyMapping toggleGoogly;
	private static final Map<Expression, KeyMapping> EXPRESSION_KEYS = new EnumMap<>(Expression.class);

	private EyeBallKeys() {
	}

	public static void register() {
		openMenu = McCompat.registerKey(new KeyMapping("key.eyeball.open_menu", InputConstants.KEY_G, CATEGORY));
		toggleGoogly = McCompat.registerKey(new KeyMapping("key.eyeball.toggle_googly", InputConstants.UNKNOWN.getValue(), CATEGORY));
		for (Expression expression : EXPRESSIONS) {
			EXPRESSION_KEYS.put(expression, McCompat.registerKey(
				new KeyMapping("key.eyeball.expression." + expression.key(), InputConstants.UNKNOWN.getValue(), CATEGORY)));
		}
	}

	/** The "Open Googly Goobers Menu" key (G by default). */
	public static KeyMapping openMenuKey() {
		return openMenu;
	}

	public static void tick(Minecraft minecraft) {
		while (openMenu.consumeClick()) {
			McCompat.setScreen(minecraft, new EyeBallConfigScreen(McCompat.screen(minecraft)));
		}
		EyeBallConfig config = ConfigManager.get();
		while (toggleGoogly.consumeClick()) {
			config.googlyEyes = !config.googlyEyes;
			changed(minecraft, "eyeball.option.googly_eyes", config.googlyEyes);
		}
		for (Map.Entry<Expression, KeyMapping> entry : EXPRESSION_KEYS.entrySet()) {
			while (entry.getValue().consumeClick()) {
				makeFace(minecraft, entry.getKey());
			}
		}
	}

	public static void makeFace(Minecraft minecraft, Expression expression) {
		if (minecraft.player == null) {
			return;
		}
		FaceAnimationManager.INSTANCE.onExpression(minecraft.player.getUUID(), expression, EXPRESSION_TICKS);
		ClientSync.sendFaceEvent(FaceEventKind.EXPRESSION, expression, EXPRESSION_TICKS);
	}

	private static void changed(Minecraft minecraft, String optionKey, boolean value) {
		ConfigManager.save();
		ConfigManager.notifyChanged();
		if (minecraft.player != null) {
			McCompat.overlayMessage(minecraft.player, Component.translatable(optionKey)
				.append(": ")
				.append(Component.translatable(value ? "options.on" : "options.off")
					.withStyle(value ? ChatFormatting.GREEN : ChatFormatting.RED)));
		}
	}
}
