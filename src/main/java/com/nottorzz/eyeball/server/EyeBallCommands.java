package com.nottorzz.eyeball.server;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import com.mojang.brigadier.suggestion.Suggestions;
import com.mojang.brigadier.suggestion.SuggestionsBuilder;
import com.nottorzz.eyeball.Appearance;
import com.nottorzz.eyeball.Expression;
import com.nottorzz.eyeball.FaceEventKind;
import java.util.Collection;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import net.minecraft.ChatFormatting;
import net.minecraft.commands.CommandBuildContext;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.arguments.EntityArgument;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import org.jspecify.annotations.Nullable;

/**
 * {@code /eyeball} - server-side controls (requires the mod on the server).
 * <pre>
 * /eyeball googly &lt;targets&gt; on|off|reset   (operators) force googly eyes on players
 * /eyeball elmo &lt;targets&gt; on|off|reset     (operators) force the Elmo transformation
 * /eyeball react &lt;targets&gt;                 (operators) play a spiral-eye hit reaction
 * /eyeball expression &lt;name&gt;               (everyone)  make a face that nearby players see
 * /eyeball status                            (everyone)  show who wears what
 * </pre>
 * Forced looks are only visible to players who have EyeBall installed; the feedback says so.
 */
public final class EyeBallCommands {
	private static final int REACTION_TICKS = 32;
	private static final int EXPRESSION_TICKS = 60;

	private EyeBallCommands() {
	}

	public static void register(CommandDispatcher<CommandSourceStack> dispatcher, CommandBuildContext context, Commands.CommandSelection selection) {
		dispatcher.register(Commands.literal("eyeball")
			.then(forceLiteral("googly", ForcedLookStore.LookEffect.GOOGLY))
			.then(forceLiteral("elmo", ForcedLookStore.LookEffect.ELMO))
			.then(Commands.literal("react")
				.requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS))
				.then(Commands.argument("targets", EntityArgument.players())
					.executes(EyeBallCommands::react)))
			.then(Commands.literal("expression")
				.then(Commands.argument("expression", StringArgumentType.word())
					.suggests(EyeBallCommands::suggestExpressions)
					.executes(EyeBallCommands::expression)))
			.then(Commands.literal("status").executes(EyeBallCommands::status)));
	}

	private static com.mojang.brigadier.builder.LiteralArgumentBuilder<CommandSourceStack> forceLiteral(String name, ForcedLookStore.LookEffect effect) {
		return Commands.literal(name)
			.requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS))
			.then(Commands.argument("targets", EntityArgument.players())
				.then(Commands.literal("on").executes(c -> force(c, effect, Boolean.TRUE)))
				.then(Commands.literal("off").executes(c -> force(c, effect, Boolean.FALSE)))
				.then(Commands.literal("reset").executes(c -> force(c, effect, null))));
	}

	private static int force(CommandContext<CommandSourceStack> context, ForcedLookStore.LookEffect effect, @Nullable Boolean value) throws CommandSyntaxException {
		Collection<ServerPlayer> targets = EntityArgument.getPlayers(context, "targets");
		ForcedLookStore store = EyeBallServer.forcedLooks();
		int changed = 0;
		int withMod = 0;
		for (ServerPlayer target : targets) {
			if (store.set(target.getUUID(), target.getGameProfile().name(), effect, value)) {
				changed++;
				EyeBallServer.broadcastLook(context.getSource().getServer(), target.getUUID());
			}
			if (EyeBallServer.hasMod(target)) {
				withMod++;
			}
		}
		String what = effect == ForcedLookStore.LookEffect.GOOGLY ? "Googly eyes" : "Elmo transformation";
		String state = value == null ? "reset to each player's own choice" : value ? "forced ON" : "forced OFF";
		int finalWithMod = withMod;
		int finalChanged = changed;
		context.getSource().sendSuccess(() -> Component.literal(what + " " + state + " for " + targets.size() + " player(s)"
				+ (finalChanged != targets.size() ? " (" + finalChanged + " changed)" : "") + ". ")
			.append(Component.literal("Visible to everyone who has EyeBall installed (" + finalWithMod + " of the targets have it).")
				.withStyle(ChatFormatting.GRAY)), true);
		return targets.size();
	}

	private static int react(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		Collection<ServerPlayer> targets = EntityArgument.getPlayers(context, "targets");
		int receivers = 0;
		for (ServerPlayer target : targets) {
			receivers += EyeBallServer.relay(target, FaceEventKind.REACTION, Expression.DIZZY, REACTION_TICKS, true);
		}
		int finalReceivers = receivers;
		context.getSource().sendSuccess(() -> Component.literal("Bonk! Played a hit reaction on " + targets.size()
			+ " player(s) (" + finalReceivers + " modded viewer(s) notified)."), true);
		return targets.size();
	}

	private static int expression(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
		ServerPlayer player = context.getSource().getPlayerOrException();
		String name = StringArgumentType.getString(context, "expression").toUpperCase(Locale.ROOT);
		Expression expression;
		try {
			expression = Expression.valueOf(name);
		} catch (IllegalArgumentException e) {
			expression = null;
		}
		if (expression == null || !expression.isPlayerSelectable()) {
			context.getSource().sendFailure(Component.literal("Unknown expression '" + name.toLowerCase(Locale.ROOT) + "'."));
			return 0;
		}
		EyeBallServer.relay(player, FaceEventKind.EXPRESSION, expression, EXPRESSION_TICKS, true);
		Expression finalExpression = expression;
		context.getSource().sendSuccess(() -> Component.literal("You make a " + finalExpression.key().replace('_', ' ') + " face."), false);
		return 1;
	}

	private static int status(CommandContext<CommandSourceStack> context) {
		CommandSourceStack source = context.getSource();
		int shown = 0;
		for (ServerPlayer player : source.getServer().getPlayerList().getPlayers()) {
			int flags = EyeBallServer.effectiveLook(player.getUUID());
			ForcedLookStore.Forced forced = EyeBallServer.forcedLooks().get(player.getUUID());
			String line = player.getGameProfile().name() + ": " + Appearance.describe(flags)
				+ (forced != null ? " (forced)" : "")
				+ (EyeBallServer.hasMod(player) ? "" : " - no EyeBall mod");
			source.sendSuccess(() -> Component.literal(line), false);
			shown++;
		}
		if (shown == 0) {
			source.sendSuccess(() -> Component.literal("No players online."), false);
		}
		return shown;
	}

	private static CompletableFuture<Suggestions> suggestExpressions(CommandContext<CommandSourceStack> context, SuggestionsBuilder builder) {
		for (Expression expression : Expression.values()) {
			if (expression.isPlayerSelectable()) {
				builder.suggest(expression.key());
			}
		}
		return builder.buildFuture();
	}
}
