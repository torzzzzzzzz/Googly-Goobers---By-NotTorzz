package com.nottorzz.eyeball.client.talk;

import com.mojang.authlib.GameProfile;
import com.nottorzz.eyeball.FaceEventKind;
import com.nottorzz.eyeball.client.anim.ExpressionDetector;
import com.nottorzz.eyeball.client.anim.FaceAnimationManager;
import com.nottorzz.eyeball.client.network.ClientSync;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import net.fabricmc.fabric.api.client.message.v1.ClientReceiveMessageEvents;
import net.fabricmc.fabric.api.client.message.v1.ClientSendMessageEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.network.chat.PlayerChatMessage;
import org.jspecify.annotations.Nullable;

/**
 * Makes mouths move when people chat. Works without any server support:
 * <ul>
 *     <li>Normal player chat carries the sender, so their face starts talking with an expression
 *     picked from the message text.</li>
 *     <li>Many servers re-send chat as plain "system" messages ({@code [Rank] Name: hi},
 *     {@code <Name> hi}, {@code Name » hi}); those are matched against the tab list.</li>
 *     <li>Your own messages animate your face immediately, and are relayed to other modded
 *     players when the server has EyeBall.</li>
 * </ul>
 */
public final class ChatTalkDetector {
	/** "Name: message", "[Rank] Name » message", "<Name> message", "Name > message". */
	private static final Pattern SYSTEM_CHAT = Pattern.compile(
		"^(?:\\[[^\\]]{0,24}\\]\\s*|[^\\w<]{0,3})*<?([A-Za-z0-9_]{3,16})>?\\s*(?::|»|>|»|-)\\s+(.+)$");
	private static final long SELF_ECHO_WINDOW_MS = 4000L;

	private static String lastOwnMessage = "";
	private static long lastOwnMessageTime;

	private ChatTalkDetector() {
	}

	public static void init() {
		ClientSendMessageEvents.CHAT.register(ChatTalkDetector::onOwnMessage);
		ClientReceiveMessageEvents.CHAT.register((message, signedMessage, sender, params, receptionTimestamp) ->
			onPlayerChat(sender, signedMessage, message.getString()));
		ClientReceiveMessageEvents.GAME.register((message, overlay) -> {
			if (!overlay) {
				onSystemMessage(message.getString());
			}
		});
	}

	private static void onOwnMessage(String message) {
		Minecraft minecraft = Minecraft.getInstance();
		if (minecraft.player == null) {
			return;
		}
		lastOwnMessage = message;
		lastOwnMessageTime = System.currentTimeMillis();
		FaceAnimationManager.INSTANCE.onChat(minecraft.player.getUUID(), message);
		ClientSync.sendFaceEvent(FaceEventKind.TALK, ExpressionDetector.detect(message), ExpressionDetector.talkTicks(message));
	}

	private static void onPlayerChat(@Nullable GameProfile sender, @Nullable PlayerChatMessage signed, String displayed) {
		if (sender == null) {
			onSystemMessage(displayed);
			return;
		}
		String text = signed != null ? signed.signedContent() : stripName(displayed, sender.name());
		speak(sender.id(), text);
	}

	private static void onSystemMessage(String text) {
		if (text.length() > 300) {
			return;
		}
		Matcher matcher = SYSTEM_CHAT.matcher(text.strip());
		if (!matcher.matches()) {
			return;
		}
		UUID id = findPlayer(matcher.group(1));
		if (id != null) {
			speak(id, matcher.group(2));
		}
	}

	private static void speak(UUID player, String message) {
		Minecraft minecraft = Minecraft.getInstance();
		if (minecraft.player != null && minecraft.player.getUUID().equals(player)
			&& message.equals(lastOwnMessage) && System.currentTimeMillis() - lastOwnMessageTime < SELF_ECHO_WINDOW_MS) {
			// The server echoing our own message back: we already started talking.
			return;
		}
		FaceAnimationManager.INSTANCE.onChat(player, message);
	}

	private static @Nullable UUID findPlayer(String name) {
		ClientPacketListener connection = Minecraft.getInstance().getConnection();
		if (connection == null) {
			return null;
		}
		PlayerInfo info = connection.getPlayerInfoIgnoreCase(name);
		return info != null ? info.getProfile().id() : null;
	}

	private static String stripName(String displayed, String name) {
		int index = displayed.toLowerCase(Locale.ROOT).indexOf(name.toLowerCase(Locale.ROOT));
		if (index < 0) {
			return displayed;
		}
		String rest = displayed.substring(index + name.length()).replaceFirst("^[>:»\\]\\s-]+", "");
		return rest.isEmpty() ? displayed : rest;
	}

	/** Exposed for tests. */
	public static @Nullable String[] parseSystemChat(String text) {
		Matcher matcher = SYSTEM_CHAT.matcher(text.strip());
		return matcher.matches() ? new String[]{matcher.group(1), matcher.group(2)} : null;
	}
}
