package com.nottorzz.eyeball;

import java.util.Locale;

/**
 * Facial expressions. The id is what travels over the network, so never reorder ids.
 * The visual parameters for each expression live client-side in {@code ExpressionProfile}.
 */
public enum Expression {
	NEUTRAL(0),
	TALKING(1),
	SMALL_TALK(2),
	WIDE_OPEN(3),
	SURPRISED(4),
	EXCITED(5),
	ANGRY(6),
	LAUGHING(7),
	HAPPY(8),
	CONFUSED(9),
	/** Damage reaction (spiral eyes). Not selectable as a normal expression. */
	DIZZY(10);

	private static final Expression[] BY_ID;

	static {
		BY_ID = new Expression[16];
		for (Expression expression : values()) {
			BY_ID[expression.id] = expression;
		}
	}

	public final int id;

	Expression(int id) {
		this.id = id;
	}

	public static Expression byId(int id) {
		if (id < 0 || id >= BY_ID.length || BY_ID[id] == null) {
			return NEUTRAL;
		}
		return BY_ID[id];
	}

	public String key() {
		return this.name().toLowerCase(Locale.ROOT);
	}

	/** Expressions a player can trigger on purpose (keybinds and the /eyeball expression command). */
	public boolean isPlayerSelectable() {
		return this != NEUTRAL && this != DIZZY && this != TALKING;
	}
}
