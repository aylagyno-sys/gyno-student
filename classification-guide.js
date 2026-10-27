/* Export the classifications actually available in this installation. */
(function (global) {
    'use strict';

    const text = value => typeof value === 'string' ? value.trim() : '';
    const compare = (a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

    function build(questions, taxonomy, generatedAt) {
        const branches = new Map();
        function branch(subject, chapter) {
            subject = text(subject) || 'Uncategorized';
            chapter = text(chapter) || 'General';
            if (!branches.has(subject)) branches.set(subject, new Map());
            const chapters = branches.get(subject);
            if (!chapters.has(chapter)) chapters.set(chapter, new Set(['General']));
            return chapters.get(chapter);
        }
        // The installed source taxonomy contributes every selectable topic even
        // when no questions have been imported. Existing question branches remain
        // listed as well so the guide describes this installation honestly.
        const configured = global.AYLA_TAXONOMY;
        for (const subject of configured && Array.isArray(configured.subjects) ? configured.subjects : []) {
            const subjectName = text(subject.name);
            if (!subjectName) continue;
            for (const chapter of Array.isArray(subject.chapters) ? subject.chapters : []) {
                const chapterName = text(chapter.name);
                if (!chapterName) continue;
                const topics = branch(subjectName, chapterName);
                for (const topic of Array.isArray(chapter.topics) ? chapter.topics : []) {
                    const topicName = text(typeof topic === 'string' ? topic : topic && topic.name);
                    if (topicName) topics.add(topicName);
                }
            }
        }
        const available = taxonomy && typeof taxonomy === 'object' ? taxonomy : {};
        for (const subject of available.subjects || []) {
            const chapters = available.chaptersBySubject && available.chaptersBySubject[subject];
            if (Array.isArray(chapters) && chapters.length) {
                for (const chapter of chapters) branch(subject, chapter);
            } else branch(subject, 'General');
        }
        for (const question of Array.isArray(questions) ? questions : []) {
            if (!question || typeof question !== 'object') continue;
            branch(question.subject, question.chapter).add(text(question.topic) || 'General');
        }
        branch('Uncategorized', 'General');
        const classifications = Array.from(branches.keys()).sort(compare).map(subject => ({
            subject,
            chapters: Array.from(branches.get(subject).keys()).sort(compare).map(chapter => ({
                chapter, topics: Array.from(branches.get(subject).get(chapter)).sort(compare)
            }))
        }));
        return {
            schemaVersion: 1,
            app: 'AYLA GYNO',
            bankId: 'ayla-gyno',
            appVersion: '1.0.1',
            sourceBook: configured && configured.book ? { ...configured.book } : null,
            generatedAt: generatedAt || new Date().toISOString(),
            instructions: [
                'Return one JSON file containing all extracted MCQs; do not split the result into separate subject or chapter files.',
                'Select subject, chapter and topic only from a single listed branch, using its exact spelling.',
                'General is the application\'s built-in fallback topic; do not invent new classifications.',
                'When no specific branch fits confidently, use Uncategorized / General / General and report the question for review.'
            ],
            classifications
        };
    }

    async function download() {
        await db.ensureReady();
        const questions = await db.getAllQuestions();
        const guide = build(questions, computeTaxonomy(questions));
        const blob = new Blob([JSON.stringify(guide, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'AYLA-GYNO-Classification-Guide.json';
        anchor.hidden = true;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return guide;
    }

    global.ClassificationGuide = Object.freeze({ build, download });
})(window);
