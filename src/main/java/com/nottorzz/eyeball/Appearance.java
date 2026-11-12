package com.nottorzz.eyeball;

/**
 * Bit flags describing which cartoon effects a player wears. Shared by the client and the
 * server so they agree on the wire format.
 */
public final class Appearance {
	public static final int NONE = 0;
	public static final int GOOGLY = 1;
	public static final int ELMO = 1 << 1;
	/** Sync-only bit: the googly flag was forced by an operator (so it also applies to that player's own view). */
	public static final int FORCED_GOOGLY = 1 << 2;
	/** Sync-only bit: the Elmo flag was forced by an operator. */
	public static final int FORCED_ELMO = 1 << 3;
	public static final int LOOK_MASK = GOOGLY | ELMO;

	private Appearance() {
	}

	public static boolean googly(int flags) {
		return (flags & GOOGLY) != 0;
	}

	public static boolean elmo(int flags) {
		return (flags & ELMO) != 0;
	}

	public static int of(boolean googly, boolean elmo) {
		return (googly ? GOOGLY : 0) | (elmo ? ELMO : 0);
	}

	public static boolean forcedGoogly(int flags) {
		return (flags & FORCED_GOOGLY) != 0;
	}

	public static boolean forcedElmo(int flags) {
		return (flags & FORCED_ELMO) != 0;
	}

	public static String describe(int flags) {
		flags &= LOOK_MASK;
		if (flags == NONE) {
			return "normal";
		}
		if (googly(flags) && elmo(flags)) {
			return "googly eyes + Elmo";
		}
		return googly(flags) ? "googly eyes" : "Elmo";
	}
}
