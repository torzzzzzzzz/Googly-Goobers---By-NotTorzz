package com.nottorzz.eyeball.client.anim;

import com.nottorzz.eyeball.Expression;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Picks a facial expression from what a player typed, so every client shows the same face for the
 * same chat message without any networking:
 * <ul>
 *     <li>"hahaha", "lol", "xD" ... laughing</li>
 *     <li>"wow", "omg", "?!" ... surprised</li>
 *     <li>"grr", "&gt;:(" ... angry</li>
 *     <li>ALL CAPS ... wide-open shouting</li>
 *     <li>"yay!", "let's go" ... excited</li>
 *     <li>"huh?", "hmm" ... confused</li>
 *     <li>":)", "nice" ... happy</li>
 *     <li>very short messages ... small talking mouth</li>
 * </ul>
 */
public final class ExpressionDetector {
	private static final Pattern LAUGH = Pattern.compile(
		"(h[ae]){2,}|\\b(lol+|lmao+|lmfao|rofl|kek|xd+|hehe+)\\b|:d\\b|xd|😂|🤣|😆");
	private static final Pattern ANGRY = Pattern.compile(
		"\\b(grr+|angry|mad|hate|stupid|ugh+|argh+|rage|annoying)\\b|>:\\(|>:\\[|😠|😡|🤬");
	private static final Pattern SURPRISED = Pattern.compile(
		"\\b(wow+|whoa+|woah+|omg+|no way|wa{2,}i+t+|wha{2,}t+|oh my|holy)\\b|\\?!|!\\?|:o\\b|:0\\b|😮|😲|😱");
	private static final Pattern EXCITED = Pattern.compile(
		"\\b(yay+|yes+|let'?s go+|lets go+|awesome|amazing|pog+|poggers|gg+|woo+|yippee+|epic)\\b|🎉|🤩");
	private static final Pattern CONFUSED = Pattern.compile(
		"\\b(huh+|hmm+|what\\?|idk|confused|wut)\\b|\\?\\?+|🤔|😕");
	private static final Pattern HAPPY = Pattern.compile(
		"\\b(nice|cool|thanks|thank you|ty|love|cute|good)\\b|:\\)|:-\\)|\\(:|<3|😊|🙂|❤");

	private ExpressionDetector() {
	}

	public static Expression detect(String message) {
		String text = message.strip();
		if (text.isEmpty()) {
			return Expression.TALKING;
		}
		String lower = text.toLowerCase(Locale.ROOT);
		if (LAUGH.matcher(lower).find()) {
			return Expression.LAUGHING;
		}
		if (ANGRY.matcher(lower).find()) {
			return Expression.ANGRY;
		}
		if (isShouting(text)) {
			return text.contains("!") && text.length() > 8 ? Expression.ANGRY : Expression.WIDE_OPEN;
		}
		if (SURPRISED.matcher(lower).find()) {
			return Expression.SURPRISED;
		}
		if (EXCITED.matcher(lower).find() || text.endsWith("!!")) {
			return Expression.EXCITED;
		}
		if (CONFUSED.matcher(lower).find()) {
			return Expression.CONFUSED;
		}
		if (HAPPY.matcher(lower).find()) {
			return Expression.HAPPY;
		}
		if (text.endsWith("!")) {
			return Expression.EXCITED;
		}
		if (text.length() <= 6) {
			return Expression.SMALL_TALK;
		}
		return Expression.TALKING;
	}

	/** Talk duration in ticks for a message: longer messages talk for longer (0.8 s to 7 s). */
	public static int talkTicks(String message) {
		int letters = 0;
		for (int i = 0; i < message.length(); i++) {
			if (Character.isLetterOrDigit(message.charAt(i))) {
				letters++;
			}
		}
		return Math.clamp(14 + Math.round(letters * 1.7F), 16, 140);
	}

	private static boolean isShouting(String text) {
		int upper = 0;
		int letters = 0;
		for (int i = 0; i < text.length(); i++) {
			char c = text.charAt(i);
			if (Character.isLetter(c)) {
				letters++;
				if (Character.isUpperCase(c)) {
					upper++;
				}
			}
		}
		return letters >= 4 && upper >= letters * 0.8F;
	}
}
