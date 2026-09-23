(function (global) {
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    function createInitialRecord(entry) {
        return {
            wordId: entry.id,
            word: entry.en,
            translation: entry.zh,
            pos: entry.pos,
            easeFactor: 2.5,
            interval: 0,
            repetitions: 0,
            nextReviewAt: Date.now(),
            status: "learning",
            source: entry.lexicon
        };
    }

    function gradeToQuality(grade) {
        switch (grade) {
            case "mastered": return 5;
            case "review": return 3;
            case "skip": return 0;
            default: return 3;
        }
    }

    function applyReview(record, grade) {
        const quality = gradeToQuality(grade);
        const next = { ...record };

        if (grade === "skip") {
            next.status = "skipped";
            next.nextReviewAt = Date.now() + 365 * MS_PER_DAY;
            return next;
        }

        if (grade === "mastered") {
            next.status = "mastered";
            next.repetitions += 1;
            next.interval = Math.max(next.interval, 21);
            next.nextReviewAt = Date.now() + next.interval * MS_PER_DAY;
            return next;
        }

        if (quality < 3) {
            next.repetitions = 0;
            next.interval = 1;
            next.status = "learning";
        } else {
            next.repetitions += 1;
            if (next.repetitions === 1) {
                next.interval = 1;
            } else if (next.repetitions === 2) {
                next.interval = 6;
            } else {
                next.interval = Math.round(next.interval * next.easeFactor);
            }
            next.status = next.repetitions >= 3 ? "review" : "learning";
        }

        next.easeFactor = Math.max(
            1.3,
            next.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        );
        next.nextReviewAt = Date.now() + next.interval * MS_PER_DAY;
        return next;
    }

    function isDue(record) {
        if (!record || record.status === "skipped" || record.status === "mastered") {
            return false;
        }
        return record.nextReviewAt <= Date.now();
    }

    function priorityScore(record) {
        if (!record) return 0;
        if (record.status === "skipped" || record.status === "mastered") return -1;
        if (isDue(record)) return 1000 + record.repetitions;
        return record.repetitions;
    }

    global.GlossX = global.GlossX || {};
    global.GlossX.SM2 = {
        createInitialRecord,
        applyReview,
        isDue,
        priorityScore
    };
})(typeof globalThis !== "undefined" ? globalThis : window);
