package com.nottorzz.eyeball.gametest;

import com.nottorzz.eyeball.EyeBallMod;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;

/** Collects every check and screenshot, writes a Markdown report, and fails the run if any check failed. */
final class TestReport {
	private final List<String> lines = new ArrayList<>();
	private final List<String> failures = new ArrayList<>();
	private final List<String> screenshots = new ArrayList<>();
	private int passed;

	void section(String title) {
		this.lines.add("");
		this.lines.add("### " + title);
		EyeBallMod.LOGGER.info("[gametest] === {} ===", title);
	}

	void check(String name, boolean ok, String detail) {
		String line = (ok ? "- PASS " : "- **FAIL** ") + name + (detail.isEmpty() ? "" : " (" + detail + ")");
		this.lines.add(line);
		if (ok) {
			this.passed++;
		} else {
			this.failures.add(name + (detail.isEmpty() ? "" : " (" + detail + ")"));
		}
		EyeBallMod.LOGGER.info("[gametest] {} {} {}", ok ? "PASS" : "FAIL", name, detail);
	}

	void note(String text) {
		this.lines.add("- " + text);
		EyeBallMod.LOGGER.info("[gametest] note: {}", text);
	}

	void screenshot(ClientGameTestContext context, String name, String caption) {
		Path path = context.takeScreenshot(name);
		this.screenshots.add("- `" + path.getFileName() + "`: " + caption);
	}

	int failureCount() {
		return this.failures.size();
	}

	void write(Path file) {
		List<String> out = new ArrayList<>();
		out.add("# EyeBall Mod - in-game test report");
		out.add("");
		out.add("Passed: " + this.passed + ", failed: " + this.failures.size());
		out.addAll(this.lines);
		out.add("");
		out.add("### Screenshots");
		out.addAll(this.screenshots);
		try {
			Files.write(file, out, StandardCharsets.UTF_8);
		} catch (IOException e) {
			EyeBallMod.LOGGER.error("Could not write test report", e);
		}
	}

	void finish() {
		if (!this.failures.isEmpty()) {
			throw new AssertionError("EyeBall checks failed: " + String.join("; ", this.failures));
		}
	}
}
