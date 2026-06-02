-- =============================================================================
-- Migration: 0049_seed_dsat_nov_2023.sql
-- Purpose:   Seed "Test #1 — Digital SAT, November 2023" (98 questions across
--            4 timed modules) into the full-test tables from 0048.
--
--   Generated from pdf/DSAT-Nov_2023.pdf by .work/dsat/gen-seed.mjs.
--   Idempotent: upserts on (slug) / (test_id, position) / (module_id, position),
--   so re-running updates content WITHOUT deleting existing student test_runs.
--   Answer key + question text live ONLY here / in Postgres — never web-served.
-- =============================================================================

DO $seed$
DECLARE
  v_test uuid;
  v_mod  uuid;
BEGIN
  INSERT INTO public.tests (slug, ordinal, title, short_title, source, total_questions)
  VALUES ('dsat-nov-2023', 1, 'Test #1 — Digital SAT, November 2023', 'DSAT Nov 2023', 'DSAT-Nov_2023.pdf', 98)
  ON CONFLICT (slug) DO UPDATE
    SET ordinal = EXCLUDED.ordinal, title = EXCLUDED.title,
        short_title = EXCLUDED.short_title, source = EXCLUDED.source,
        total_questions = EXCLUDED.total_questions
  RETURNING id INTO v_test;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 1, 'reading-writing', 'Reading and Writing — Module 1', 1920, 27)
  ON CONFLICT (test_id, position) DO UPDATE
    SET section = EXCLUDED.section, label = EXCLUDED.label,
        time_limit_seconds = EXCLUDED.time_limit_seconds,
        question_count = EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '1-1', 1, 'mcq', 'Dragon against Tiger is an important work of Nihonga, or classical Japanese painting. Unlike Wada Eisaku, who adopted traditional European methods such as painting with oil on canvas, Hashimoto Gaho ______ traditional Japanese approaches. For instance, Hashimoto produced Dragon against Tiger by applying color pigments to a silk surface.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"overlooked","B":"distrusted","C":"embraced","D":"released"}'::jsonb, NULL, 'C', NULL, NULL, 2)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '1-2', 2, 'mcq', 'Domesticated thousands of years ago in South America, the tomatillo deviates structurally from the wild plant it is descended from. Summer squash, another domesticated crop from the Americas, doesn''t closely resemble any wild plant, and genetic research only recently ______ its ancestor to be the wild Johnny gourd.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"revealed","B":"expanded","C":"encouraged","D":"petitioned"}'::jsonb, NULL, 'A', NULL, NULL, 3)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '1-3', 3, 'mcq', 'The following text is adapted from Anton Chekhov''s 1904 play The Cherry Orchard (translated by Julius West in 1916).
TROFIMOV: Believe me, Anya, believe me! I''m not thirty yet, I''m young, I''m still a student, but I have undergone a great deal! I''m as hungry as the winter, I''m ill, I''m shaken... and where haven''t I been fate has tossed me everywhere!', NULL, 'As used in the text, what does the word "undergone" most nearly mean?', '{"A":"Uncovered","B":"Ignored","C":"Experienced","D":"Conveyed"}'::jsonb, NULL, 'C', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '1-4', 4, 'mcq', 'Text corpora such as the British National Corpus are enormous collections of electronically stored texts that can be used for empirical testing of hypotheses regarding the frequency of typical word usage. If one has a ______ that the word "own" has a high incidence in English, for example, an analysis of a corpus can support that hypothesis by showing that "own" is the eighth most commonly used adjective.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"synopsis","B":"scheme","C":"recognition","D":"supposition"}'::jsonb, NULL, 'D', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '1-5', 5, 'mcq', 'Researchers have long hypothesized that woolly mammoths were hunted to extinction in North America by humans using spears with grooved tips known as Clovis points. One anthropologist set out to test this hypothesis. Using a mechanical spear-thrower, he launched spears with Clovis points into mounds of clay substitutes for the animals'' large bodies. The projectiles generally penetrated only a few inches into the clay, an amount insufficient to have harmed most woolly mammoths. This led the anthropologist to conclude that hunters using spears with Clovis points likely weren''t the principal drivers of the extinction.', NULL, 'Which choice best states the main purpose of the text?', '{"A":"To argue for the significance of new findings amid an ongoing debate among researchers","B":"To discuss the advantages and disadvantages of the method used in an experiment","C":"To summarize two competing hypotheses and a major finding associated with each one","D":"To describe an experiment whose results cast doubt on an established hypothesis"}'::jsonb, NULL, 'D', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '1-6', 6, 'mcq', 'In what is now Washington state, the Tulalip Tribes operate the Hibulb Cultural Center. Relying on traditional knowledge to guide the design of exhibits, this institution presents Tulalip history and culture to the tribes'' citizens. The Turtle Mountain Band of Chippewa, a tribe in North Dakota, employs a similar strategy in its own cultural center. Both centers contrast with museums that aren''t Indigenous-led; when displaying Indigenous artifacts, such museums tend to anticipate mainly non-Indigenous audiences and rely on Eurocentric strategies for designing exhibits.', NULL, 'Which choice best describes the overall structure of the text?', '{"A":"It describes how tribal cultural centers designed exhibits of a particular set of artifacts, then analyzes how non-Indigenous institutions designed exhibits of the same artifacts.","B":"It examines how tribal citizens respond to exhibits at tribal cultural centers, then speculates how non-Indigenous audiences would respond to the same exhibits.","C":"It discusses two cultural centers operated by tribes, then compares them with non-Indigenous institutions that present Indigenous exhibits.","D":"It outlines an early strategy for exhibit design used by one tribal cultural center, then explains a newer strategy used by a different tribal cultural center."}'::jsonb, NULL, 'C', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '1-7', 7, 'mcq', 'Text 1
The University of Wisconsin and the online class provider Coursera are two of the many institutions offering training programs in entrepreneurship. But what results do such programs produce? In a study of aspiring entrepreneurs in the United States, researcher James Chrisman and colleagues addressed this question and reported that participants who received entrepreneurial training showed high performance at their jobs.
Text 2
While studies of entrepreneurial training typically report positive results, a close look reveals widespread methodological shortcomings that could explain those findings. These studies are plagued by insufficient sample sizes, a lack of control groups, and failures to establish pretraining baselines for the measured attributes of participants.', NULL, 'Based on the texts, the author of Text 2 would most likely want to know if Chrisman and colleagues took steps to preclude which potential objection to the finding described in Text 1 ??', '{"A":"The participants would have shown greater responsiveness to the training if the training sessions had lasted longer.","B":"The participants would have been less likely to show high performance at their jobs if the study sample had been smaller.","C":"The participants would have shown high performance at their jobs regardless of whether they received the training.","D":"The participants would have responded to the training differently if they had not known that they were participating in a study."}'::jsonb, NULL, 'C', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '1-8', 8, 'mcq', '"Cocoa" is an example of a loanword——that is, a word that originated in one language and was later adopted by another. The word came to English indirectly from cacao, the Spanish word for the plant that chocolate is made from. Spanish had borrowed it from Nahuatl, an Indigenous language of Central Mexico, in which the word''s original form is cacahuatl. "Puma" is also Indigenous in origin and entered English through Spanish. But in this case, the original source was Quechua, a language of South America, in which the word for the mountain lion is also puma.', NULL, 'The author makes which point about the Spanish language?', '{"A":"It has served as a medium through which Indigenous languages have influenced English.","B":"Its contribution to English vocabulary roughly equals the collective contribution by Indigenous languages.","C":"It adopted Nahuatl and Quechua words in approximately equal numbers.","D":"It has borrowed words from Indigenous languages and contributed words to them."}'::jsonb, NULL, 'A', NULL, NULL, 9)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '1-9', 9, 'mcq', 'In Bolivia, use of solid fuel (e.g., coal, wood) as a share of total household fuel use fell by more than half between 2000 and 2015; such shifts are typically explained by appeal to the energy ladder, a model holding that fuel choice is mediated mainly by household income (specifically, high-technology fuels displace solid fuels as incomes rise). Richard Hosier and Jeffrey Dowd''s study of fuel use in Zimbabwe shows how reductive this model is, however: although income of course constrained fuel choice, several factors, including the difficulty of acquiring fuel sources, influenced decisions.', NULL, 'Based on the text, the author would most likely agree with which statement about household income?', '{"A":"It can explain some but not all of the differences in fuel choice across households.","B":"It is often said to influence household fuel choice but actually does not.","C":"It affects household fuel choice but not for the reasons assumed by the energy ladder model.","D":"It constrains the amount of fuel households use but not the type of fuel they use."}'::jsonb, NULL, 'A', NULL, NULL, 10)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '1-10', 10, 'mcq', 'The following text is adapted from Daniel Defoe''s 1704 nonfiction book The Storm.
The sermon is a sound of words spoken to the ear, and prepared only for present meditation, and extends no farther than the strength of memory can convey it; a book printed is a record; remaining in every man''s possession, always ready to renew its acquaintance with his memory, and always ready to be produced as an authority or voucher to any reports he makes out of it, and conveys its contents for ages to come, to the eternity of mortal time, when the author is forgotten in his grave.', NULL, 'Which choice best states the main idea of the text?', '{"A":"Words committed to print have a greater permanence than messages that are merely spoken aloud.","B":"People are less likely to forget a message when they hear it spoken aloud than they are when they read it in print.","C":"Unless a spoken message is delivered by an expert, it can be safely ignored.","D":"Most authors have little hope of being remembered well past their lifetimes."}'::jsonb, NULL, 'A', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '1-11', 11, 'mcq', NULL, 'Total Science Research Submissions by Topic, 2016-2019

[Line graph] X-axis: Year (2016, 2017, 2018, 2019). Y-axis: Number of submissions (0 to 350).
Four topics tracked:
- cellular and molecular biology (filled triangles): 2016 approximately 200, 2017 approximately 300, 2018 approximately 250, 2019 approximately 275
- physics and space science (open squares): roughly 100 across all years, rising slightly to approximately 100 by 2019
- medicine and health (open circles): approximately 100 in 2016, dipping then rising to approximately 285 in 2019
- animal science (filled diamonds): lowest, approximately 50, rising to approximately 95 in 2019

A student is researching the trends in the topics submitted to a national science fair for high school students. The graph shows the number of submissions by topic that were made each year. Based on the data in the graph, the student claims that there were more medicine and health research topics submitted in 2019 than in any other year.', 'Which choice most effectively uses data from the graph to support the underlined claim?', '{"A":"In 2016, the number of cellular and molecular biology topic submissions was the same as the number of animal science topic submissions.","B":"In 2019, there were more physics and space science topic submissions than there were medicine and health topic submissions.","C":"The lowest number of animal science topic submissions in a year was approximately 95 in 2016.","D":"The highest number of medicine and health topic submissions during the period shown is approximately 285 in 2019."}'::jsonb, '/data/tests/dsat-nov-2023/figures/m1-q11.png', 'D', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '1-12', 12, 'mcq', 'Claudine at School is a 1900 novel by Colette, originally written in French. The narrator is a fifteen-year-old girl living in a small, rural town. She presents herself as having a strong emotional attachment to the surrounding forests:______', NULL, 'Which quotation from a translation of Claudine at School most effectively illustrates the claim?', '{"A":"\"If I had a Mamma, I know very well that she would not have let me stay [in Montigny] twenty-four hours. But Papa he doesn''t notice anything and doesn''t bother about me.\"","B":"\"And then there are my favourites, the great woods that are sixteen and twenty years old. It makes my heart bleed to see one of those cut down.\"","C":"\"Green meadows make rifts in [the woods] here and there, so do little patches of cultivation. But these do not amount to much, for the magnificent woods devour everything. As a result, this lovely region is atrociously poor and its few scattered farms provide just the requisite number of red roofs to set off the velvety green of the woods.\"","D":"\"Under the firs, you light a fire, even in summer, because it''s forbidden; you cook any old thing, an apple, a pear, a potato stolen from a field, some wholemeal bread if you''ve nothing better.\""}'::jsonb, NULL, 'B', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '1-13', 13, 'mcq', NULL, 'Annual Mean Forest Patch Size for Three Land Use Capability Classes in the Chorotega Region, Costa Rica

[Line graph] X-axis: Year (1960, 1979, 1986, 2000). Y-axis: Mean patch size (hectares) (0 to 150).
Three classes tracked:
- Class VIII (cannot be used for commercial crops) (filled triangles): approximately 125 in 1960, approximately 125 in 1979, dropping to approximately 30 in 1986, rising to approximately 60 in 2000
- Class VI (severe limitations on use for crops) (open squares): approximately 60 in 1960, approximately 75 in 1979, dropping to approximately 30 in 1986, rising to approximately 50 in 2000
- Class VII (very severe limitations on use for crops) (open circles): approximately 65 in 1960, approximately 85 in 1979, dropping to approximately 35 in 1986, rising to approximately 50 in 2000', 'Which choice most effectively uses data from the graph to complete the assertion?', '{"A":"difference between mean forest patch size in Class VIII and in Class VI in 2000.","B":"steady increase in mean forest patch size from 1960 to 1979, followed by a more sudden increase in 1986 for all classes.","C":"increase in mean forest patch size after 1986 in all classes.","D":"similarity in mean forest patch size in Class VIII and Class VII in 1986."}'::jsonb, '/data/tests/dsat-nov-2023/figures/m1-q13.png', 'C', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '1-14', 14, 'mcq', 'Veronica L. Bura, Akito Y. Kawahara, and Jayne E. Yack investigated the evolution and function of sound production in silk moth and hawk moth caterpillars. They found that during harmless simulated attacks on isolated caterpillars, 33% of the tested species produced sound, which ranged from clicks in Actias luna to whistles in Rhodinia fugax. Although some insects use sound to communicate with members of the same species, the researchers claim that the caterpillar sounds recorded in their study are directed primarily at predators.', NULL, 'Which finding, if true, would most directly support Bura and colleagues'' claim?', '{"A":"In most cases, the sound that a caterpillar species produced during simulated attacks was not produced by other caterpillar species during simulated attacks.","B":"Chickens and yellow warblers, two predators of caterpillars, have been observed to stop their attacks in response to caterpillar sounds.","C":"Each caterpillar species tended to produce one sound during simulated attacks, although individuals occasionally made a variety of other sounds during simulated attacks as well.","D":"Caterpillar clicks were emitted in a frequency detectable by birds that prey on caterpillars, but caterpillar whistles were not."}'::jsonb, NULL, 'B', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '1-15', 15, 'mcq', 'In dialects of English spoken in Scotland, the "r" sound is strongly emphasized when it appears at the end of syllables (as in "car") or before other consonant sounds (as in "bird"). English dialects of the Upland South, a region stretching from Oklahoma to western Virginia, place similar emphasis on "r" at the ends of syllables and before other consonant sounds. Historical records show that the Upland South was colonized largely by people whose ancestors came from Scotland. Thus, linguists have concluded that___', NULL, 'Which choice most logically completes the text?', '{"A":"the English dialects spoken in the Upland South acquired their emphasis on the \"r\" sound from dialects spoken in Scotland.","B":"emphasis on the \"r\" sound will eventually spread from English dialects spoken in the Upland South to dialects spoken elsewhere.","C":"the English dialects spoken in Scotland were influenced by dialects spoken in the Upland South.","D":"people from Scotland abandoned their emphasis on the \"r\" sound after relocating to the Upland South."}'::jsonb, NULL, 'A', NULL, NULL, 16)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '1-16', 16, 'mcq', 'What makes the theremin a unique musical instrument? You play it without touching it. When you place your __the pitch will shift as your hands move through the air.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"hand''s between the two antenna''s,","B":"hands between the two antennas,","C":"hands'' between the two antennas'',","D":"hands'' between the two antennas,"}'::jsonb, NULL, 'B', NULL, NULL, 17)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '1-17', 17, 'mcq', 'Round Rock Chapter is one of the 110 chapters of the Navajo Nation (Naabeehó Bináhásdzo). The chapter, known as Tsé Nikání in the Navajo language (Diné bizaad), was the subject of a profile__ in the Navajo Times on February 13, 2014.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"appeared","B":"appearing","C":"appears","D":"has appeared"}'::jsonb, NULL, 'B', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '1-18', 18, 'mcq', 'San Juan High School and Grand County High School are two of several Utah__ enormous geoglyph of the letters SJ overlooks San Juan High, while a geoglyph of the letter G overlooks Grand County High.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"schools that have their own hillside geoglyphs. An","B":"schools, that have their own hillside geoglyphs and an","C":"schools that have their own hillside geoglyphs, an","D":"schools, that have their own hillside geoglyphs, and an"}'::jsonb, NULL, 'A', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '1-19', 19, 'mcq', 'Deposits of crushed orange limestone and other organic matter lend the sand at Porto Ferro Beach in Italy an unusual orange tint that dazzles__ they take a bit of sand home, though, it disturbs the beach''s ecosystem by contributing to erosion.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"visitors, when","B":"visitors and when","C":"visitors when","D":"visitors. when"}'::jsonb, NULL, 'D', NULL, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '1-20', 20, 'mcq', 'Consider the mechanics of the pinhole camera: light passes through a small hole, resulting in a focused projected image. A ray diagram reveals how this__ the hole''s small size restricts light to a single ray, all light passing through the hole can only arrive at a single destination, eliminating diffraction and ensuring a clear image.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"works because","B":"works. Because","C":"works, it''s because","D":"works: it''s because"}'::jsonb, NULL, 'B', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '1-21', 21, 'mcq', 'While the greater adjutant can be found in places like the Central Tanintharyi Coast in Myanmar and the Prek Toal Bird Sanctuary in Cambodia, more than 80 percent of this endangered stork species is found in Assam, India. There, wildlife biologist Dr. Purnima Devi Barman is on the front lines of conservation efforts that, through community involvement and scientific__ aim to bring adjutants back from near extinction.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"study","B":"study,","C":"study:","D":"study—"}'::jsonb, NULL, 'B', NULL, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '1-22', 22, 'mcq', 'In 1949, Frank Zamboni developed an ice rink resurfacing machine. As Zamboni''s machine moved along the rink''s surface, it first scraped off the top layer of ice.__ it sprayed water into the deep grooves left behind by customers'' skates. Lastly, it smoothed over the newly formed ice.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"For example,","B":"Next,","C":"Similarly,","D":"In contrast,"}'::jsonb, NULL, 'B', NULL, NULL, 23)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '1-23', 23, 'mcq', 'While researching a topic, a student has taken the following notes:
• A lever is a simple machine consisting of a rigid beam and a fulcrum.
• The fulcrum is the point about which the beam pivots.
• The input force (effort) is the force applied to the lever.
• The output force (load) is the force that the lever exerts on another object.
• In first–class levers, the fulcrum is located between the effort and the load.
• In second–class levers, the load is located between the effort and the fulcrum.', NULL, 'The student wants to contrast first–class levers and second–class levers. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"In levers, the effort is the force applied to the lever; the load, in contrast, is the force that the lever exerts on another object.","B":"In first–class and second–class levers, the fulcrum and the load are in different locations.","C":"First–class levers are simple machines consisting of a rigid beam and a fulcrum, but then again, the same is true of second–class levers.","D":"In first–class levers, the fulcrum is located between the effort and the load, but in second–class levers, the load is located between the effort and the fulcrum."}'::jsonb, NULL, 'D', NULL, NULL, 24)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '1-24', 24, 'mcq', '• Richard Serra is an American artist.
• He is known for his large metal sculptures.
• His large sculpture Open Ended is made of weathering steel.
• His large sculpture Strike: To Roberta and Rudy is made of hot–rolled steel.', NULL, 'Which choice most effectively uses information from the given sentences to emphasize a difference between the two sculptures?', '{"A":"Open Ended and Strike: To Roberta and Rudy are both large metal sculptures by artist Richard Serra.","B":"Strike: To Roberta and Rudy is one of artist Richard Serra''s large metal sculptures.","C":"Artist Richard Serra is the creator of the weathering steel sculpture Open Ended.","D":"Open Ended is made from a different kind of steel than Strike: To Roberta and Rudy."}'::jsonb, NULL, 'D', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '1-25', 25, 'mcq', '•Maya Lin is an American artist known for her memorials and large–scale installation artworks.
• She became famous in 1982 when she completed the Vietnam Veterans Memorial, which consists of two 246–foot granite walls.
• She completed Water Line in 2006.
• It is an installation composed of aluminum tubing that fills an entire gallery room.
• She completed Seven Earth Mountain in 2015.
• It is an installation composed of soil that fills an entire gallery room.', NULL, 'Which choice most effectively uses information from the given sentences to emphasize a difference between Water Line and Seven Earth Mountain?', '{"A":"After completing the Vietnam Veterans Memorial, Maya Lin completed Water Line, another large–scale work.","B":"The sprawling size of Maya Lin''s Vietnam Veterans Memorial is echoed in Water Line, a work made of aluminum tubing that fills an entire gallery room.","C":"Maya Lin''s Water Line is composed of aluminum tubing; Seven Earth Mountain, by contrast, is composed of soil.","D":"Maya Lin is known for her memorials and installation art, such as Water Line and Seven Earth Mountain."}'::jsonb, NULL, 'C', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '1-26', 26, 'mcq', 'While researching a topic, a student has taken the following notes:
• A supercontinent is a single landmass made up of most or all of Earth''s continents.
• Over time, continents merge together to form supercontinents, which then break apart.
• This process is believed to take hundreds of millions of years and is known as the supercontinent cycle.
• Euramerica and Kenorland were supercontinents.
• Euramerica formed about 300 million years ago.
• Kenorland formed about 2.6 billion years ago.', NULL, 'The student wants to specify when Euramerica formed. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"The supercontinent Euramerica formed about 300 million years ago.","B":"Over hundreds of millions of years, the supercontinent cycle results in supercontinents forming and breaking apart.","C":"Euramerica was a supercontinent, a single landmass made up of most or all of Earth''s continents.","D":"Long ago, the Earth was home to supercontinents like Euramerica and Kenorland."}'::jsonb, NULL, 'A', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '1-27', 27, 'mcq', '• The Haystack Mountain School of Crafts (1961) is a building complex designed by American architect Edward Larrabee Barnes.
• It is located in Deer Isle, Maine.
• It features a cluster of cedar–shingled buildings.
• It is considered an impressive example of critical regionalist architecture.', NULL, 'Which choice most effectively uses information from the given sentences to emphasize the location of the Haystack Mountain School of Crafts?', '{"A":"Those wishing to see the Haystack Mountain School of Crafts in person will have to travel to Deer Isle, Maine.","B":"A stunning example of critical regionalist architecture, Edward Larrabee Barnes''s Haystack Mountain School of Crafts features a cluster of cedar–shingled buildings.","C":"The architect responsible for designing the Haystack Mountain School of Crafts in Deer Isle, Maine, was Edward Larrabee Barnes.","D":"Edward Larrabee Barnes is known for designing a building complex that features a cluster of cedar–shingled buildings."}'::jsonb, NULL, 'A', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 2, 'reading-writing', 'Reading and Writing — Module 2', 1920, 27)
  ON CONFLICT (test_id, position) DO UPDATE
    SET section = EXCLUDED.section, label = EXCLUDED.label,
        time_limit_seconds = EXCLUDED.time_limit_seconds,
        question_count = EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '2-1', 1, 'mcq', 'Whether the reign of a French monarch such as Francis II or Louis XI was considered historically significant or, conversely, relatively____ , its trajectory was shaped by questions of legitimacy and therefore cannot be understood without a corollary understanding of the factors that allowed the monarch to assert a claim to the throne successfully.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"momentous","B":"inconsequential","C":"benevolent","D":"genuine"}'::jsonb, NULL, 'B', NULL, NULL, 29)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '2-2', 2, 'mcq', 'In the 2010s, the price of vintage Teenage Mutant Ninja Turtles action figures rose dramatically, which had the counterintuitive effect of____ demand: buyers who hadn''t previously wanted to purchase old action figures thronged the market, believing prices would continue to rise and the toys could be resold later at a profit.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"monetizing","B":"appraising","C":"engendering","D":"exploiting"}'::jsonb, NULL, 'C', NULL, NULL, 30)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '2-3', 3, 'mcq', 'Studying wrappers from discontinued candies, menus from nineteenth-century restaurants, and flyers promoting long-forgotten sporting events may seem like a frivolous pursuit, but ephemeral objects like these are useful as markers of cultural change: they can____shifts in norms, values, and concerns that traditional objects of historical inquiry may not.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"register","B":"vindicate","C":"preclude","D":"induce"}'::jsonb, NULL, 'A', NULL, NULL, 31)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '2-4', 4, 'mcq', '____though it seemed to many mathematicians, the Marden tameness conjecture, posed in 1974, eventually yielded to the efforts of Ian Ago, who presented a proof of it in 2004.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"Insuperable","B":"Unequivocal","C":"Irreproachable","D":"Ineluctable"}'::jsonb, NULL, 'A', NULL, NULL, 32)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '2-5', 5, 'mcq', 'Why do rusty-spotted cats purr but jaguars roar? Researchers hypothesize that this difference between the two feline species may be partly due to a U-shaped bone in their throats called the hyoid. Rusty-spotted cats, which are much smaller than jaguars, have a rigid hyoid that rumbles when the cat''s larynx vibrates, resulting in a purr. By contrast, jaguars have a somewhat flexible hyoid, and the bone is attached to the skull with a stretchy ligament that rusty-spotted cats lack. These traits allow jaguars and most other species of big cats to produce powerful roars. The same traits may also prevent most big cats from purring.', NULL, 'Which choice best describes the overall structure of the text?', '{"A":"The text compares the habitats of two species, then explains how those habitats are changing.","B":"The text presents a theory about two species, then discusses facts that weaken it.","C":"The text poses a question about two species, then presents a possible answer.","D":"The text describes a behavior shared by two species, then discusses other behaviors shared by them."}'::jsonb, NULL, 'C', NULL, NULL, 33)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '2-6', 6, 'mcq', 'Scholarly interest in literary juvenilia——writings by children and teenagers tends to focus on unpublished works by authors who became famous as adults, such as Charles Dickens''s poem "The Bill of Fare," which he wrote around the ages of 18-20, because they offer insights into their authors'' artistic development. But some scholars also argue that recovering juvenilia by lesser-known writers is essential to understanding literary history: Daisy Ashford''s novels, which she published as a child, were widely read by contemporaries and are therefore deserving of closer attention.', NULL, 'Which choice best states the main purpose of the text?', '{"A":"To describe the challenges famous writers encountered when seeking to publish works written in their childhood","B":"To present reasons why literary scholars consider juvenilia to be valuable resources","C":"To compare the accomplishments of young writers with those of their adult contemporaries","D":"To argue that Ashford''s novels have more literary merit than Dickens''s juvenilia do"}'::jsonb, NULL, 'B', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '2-7', 7, 'mcq', 'To understand how temperature change affects microorganism-mediated cycling of soil nutrients in alpine ecosystems, Eva Kastovská et al. collected plant-soil cores in the Tatra Mountains at elevations around 2,100 meters and transplanted them to elevations of 1,700-1,800 meters, where the mean air temperature was warmer by 2°C. Microorganism-mediated nutrient cycling was accelerated in the transplanted cores; crucially, microorganism community composition was unchanged, allowing Kastovská et al. to attribute the acceleration to temperature-induced increases in microorganism activity.', NULL, 'It can most reasonably be inferred from the text that the finding about the microorganism community composition was important for which reason?', '{"A":"It provided preliminary evidence that microorganism-mediated nutrient cycling was accelerated in the transplanted cores.","B":"It suggested that temperature-induced changes in microorganism activity may be occurring at increasingly high elevations.","C":"It ruled out a potential alternative explanation for the acceleration in microorganism-mediated nutrient cycling.","D":"It clarified that microorganism activity levels in the plant-soil cores varied depending on which microorganisms comprised the community."}'::jsonb, NULL, 'D', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '2-8', 8, 'mcq', 'Michael G. Campana and colleagues relied on historical DNA (hDNA)——genomic data incidentally preserved in specimens housed in natural history collections—to investigate the evolutionary origins of a fungal pathogen affecting bats. Although this approach offers unique benefits, such as access to genomic data from extirpated populations, it remains a relatively underutilized resource because hDNA is often to some extent degraded, a situation not easily remediable under current methodological paradigms and with extant DNA extraction and analysis technologies.', NULL, 'Information in the text best supports which statement about hDNA?', '{"A":"It may yield insights that other types of genomic data cannot.","B":"It has thus far proved valuable mainly to researchers studying pathogens.","C":"It may be underused because of its controversial status among scientists.","D":"It tends to be much more degraded than other types of DNA of comparable age."}'::jsonb, NULL, 'A', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '2-9', 9, 'mcq', 'In a paper for an art history class, a student claims that Rosa Bonheur''s 1855 painting The Horse Fair marks a significant change in Bonheur''s artistic development.', NULL, 'Which quotation from an art history textbook would most effectively support the student''s claim?', '{"A":"\"The paintings that Bonheur produced before The Horse Fair can be thought of as belonging to her earlier style, to which she never returned.\"","B":"\"Of all Bonheur''s paintings, none so clearly represents her abilities and ideas as The Horse Fair.\"","C":"\"The Horse Fair has been analyzed extensively since it was first exhibited, as no two viewers seem to agree about exactly what the painting means.\"","D":"\"Although Bonheur was clearly influenced by other artists of her time, she was also an artist ahead of her time, as The Horse Fair demonstrates.\""}'::jsonb, NULL, 'A', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '2-10', 10, 'mcq', 'Neurobiologists Laura Cuaya, Raúl Hernández-Pérez, and colleagues investigated the language detection abilities of eighteen dogs. The researchers monitored the brain activity of Kun-kun (a border collie), Bingo (a mixed breed), and other dogs while the animals listened to three recordings: one of The Little Prince being read in Spanish, the second in Hungarian, and a third made up of short, randomly selected fragments of the first two, scrambled so that they didn''t resemble human speech. Each dog was familiar with either Spanish or Hungarian, but not both. The team concluded that differences in dogs anatomical features may affect their ability to distinguish speech from nonspeech.', NULL, 'Which finding from the study, if true, would most directly support the team''s conclusion?', '{"A":"Compared with longer-headed dogs, shorter-headed dogs showed less difference in brain activity when hearing either Spanish or Hungarian than when hearing the scrambled recording.","B":"Compared with longer-headed dogs, shorter-headed dogs showed a greater difference in brain activity when hearing the language they were accustomed to than when hearing the other language.","C":"The pattern of brain activity that long-headed dogs showed when hearing the scrambled recording was different from the pattern of brain activity that short-headed dogs showed when hearing the language they were accustomed to.","D":"Long-headed dogs accustomed to hearing Spanish tended to show more brain activity when hearing Spanish than long-headed dogs accustomed to hearing Hungarian showed when hearing Hungarian."}'::jsonb, NULL, 'A', NULL, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '2-11', 11, 'mcq', '"Poetry" is a 1919 poem by Marianne Moore. The poem highlights an ambivalence toward poetry as the speaker acknowledges its merits while also expressing a sense of displeasure, writing____', NULL, 'Which quotation from "Poetry" most effectively illustrates the claim?', '{"A":"\"nor is it valid / to discriminate against business documents and / school-books''; all these phenomena are important.\"","B":"\"One must make a distinction / however: when dragged into prominence by half poets, the result is not / poetry\"","C":"\"when [poems] become so derivative as to become unintelligible, the / same thing may be said for all of us that we / do admire what / we cannot understand.\"","D":"\"Reading [poetry], however, with a perfect contempt for it, one discovers that there is in / it after all, a place for the genuine.\""}'::jsonb, NULL, 'D', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '2-12', 12, 'mcq', 'Cane is a 1923 novel by Jean Toomer. In one portion of the novel, Toomer uses figurative language to connect the narrator''s urban environment of Washington, DC, and the rural South of the narrator''s past, writing____', NULL, 'Which quotation from Cane most effectively illustrates the claim?', '{"A":"\"The [train] engines of this valley have a whistle, the echoes of which sound like iterated gasps and sobs. I always think of them as crude music.\"","B":"\"I sang, with a strange quiver in my voice, a promise-song.\"","C":"\"The young trees had not outgrown their [planter] boxes then. V Street [in Washington, DC] was lined with them.\"","D":"\"And when the wind is from the South, soil of my homeland falls like a fertile shower upon the lean streets of [Washington, DC].\""}'::jsonb, NULL, 'D', NULL, NULL, 40)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '2-13', 13, 'mcq', NULL, 'Simulated Change in Annual Aquifer Input and Irrigation Output if Precipitation Concentration Increases as Climate Models Predict

| Baseline concentration of annual precipitation | % change in water entering aquifers | % change in surface water for irrigation | % change in groundwater used for irrigation |
| Precipitation is currently somewhat concentrated | 4.9 | 0.4 | 0.0 |
| Precipitation is currently evenly distributed | 11.0 | 9.0 | 0.0 |

Some climate models for the western United States predict that while total annual precipitation may remain unchanged from the present level, precipitation will become concentrated in fewer but more intense rain and snow events. University of Texas climate scientist Geeta Persad and her colleagues simulated how the amount of water entering aquifers and the amount being used for irrigation purposes would change if this were to occur. Persad and her colleagues concluded that concentration of precipitation into fewer events would result in a higher number of dry days, triggering more irrigation, but that this change in irrigation output is highly sensitive to the baseline concentration of precipitation that currently exists in an area.', 'Which choice best describes data from the table that support Persad and her colleagues'' conclusion?', '{"A":"If baseline precipitation is somewhat concentrated, the amount of water being used for irrigation will increase 0.4% for surface water and 0.9% for groundwater, whereas the amount of water entering aquifers will increase 11.0% if baseline precipitation is evenly distributed.","B":"If baseline precipitation is somewhat concentrated, water use for irrigation will increase only slightly, whereas it will increase 9.0% for surface water and 7.9% for groundwater if baseline precipitation is evenly distributed.","C":"If baseline precipitation is somewhat concentrated, the amount of water entering aquifers will increase 4.9%, while the amount being used for irrigation will increase 0.4% for surface water and 0.9% for groundwater.","D":"If baseline precipitation is somewhat concentrated, water use for irrigation will decline by a small amount, whereas it will increase 11.0% for surface water and 9.0% for groundwater if baseline precipitation is evenly distributed."}'::jsonb, '/data/tests/dsat-nov-2023/figures/m2-q13.png', 'B', NULL, NULL, 41)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '2-14', 14, 'mcq', 'Ships in the British Royal Navy during the Napoleonic Wars (1803-1815) were ranked based on military strength. The system considered the number of a ship''s cannons and decks. "First-rate" was the highest ranking, and "sixth-rate" was the lowest ranking, followed by unranked ships. The size of a ship''s crew was based on this ranking: first-rate ships had between 850 and 875 crewmen, while lower-ranked ships had fewer. Two of the ships in the British Royal Navy from this period were the Boyne (98 cannons and three decks) and the Britannia (120 cannons and three decks). Of these two, only the Britannia was ranked a first-rate ship. It can therefore be concluded that____', NULL, 'Which choice most logically completes the text?', '{"A":"some ships with three decks had a crew of fewer than 850 people.","B":"the Britannia needed a crew larger than 875 people in order to operate efficiently.","C":"the Boyne had a larger crew than the Britannia.","D":"all ships with at least 98 cannons had a crew of at least 850 people."}'::jsonb, NULL, 'A', NULL, NULL, 42)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '2-15', 15, 'mcq', 'In a 2018 study, Deepak Jaiswal and Rishi Kant found that consumers'' knowledge of environmental issues had no effect on the likelihood that the consumers would purchase environmentally friendly products. Since this study was based on fewer than 400 young adults in India, however, doubts have been raised about how reliable and representative the findings are. To better understand the issue, Wencan Zhuang and colleagues analyzed the results of 54 studies of eco–friendly consumer behavior, such as a 2018 study from Indonesia that included 916 participants and a 2018 study from India with 202 participants. Taking all 54 studies together, Zhuang and colleagues found a significant positive effect of environmental knowledge on eco–friendly purchasing decisions, suggesting that__', NULL, 'Which choice most logically completes the text?', '{"A":"a sample size of 202 may be sufficient to make reliable conclusions about the relationship between knowledge of environmental issues and purchasing decisions.","B":"concerns about the broad applicability of Jaiswal and Kant''s conclusion were justified.","C":"the number of participants in Jaiswal and Kant''s study was far below the number of participants in most studies of purchasing decisions.","D":"Jaiswal and Kant''s methodology was more precise than the methodology used in the 2018 study from Indonesia."}'::jsonb, NULL, 'B', NULL, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '2-16', 16, 'mcq', 'In Norway, the Longyearbyen observatory site monitors activity in the upper atmosphere of the northern__ in Australia, another observatory site, Buckland Park, monitors the sky of the southern hemisphere. Together, they are part of the Super Dual Auroral Radar Network– or SuperDARN, as space physicists like Tadahiko Ogawa call it.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"hemisphere and","B":"hemisphere","C":"hemisphere,","D":"hemisphere;"}'::jsonb, NULL, 'D', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '2-17', 17, 'mcq', 'Long attributed to Jacques–Louis David, the preeminent Neoclassical painter of his day, the 1801 painting Marie Joséphine Charlotte du Val d''Ognes gained fresh attention in the 1990s when art historians discovered that the painting—which depicts a solitary young woman sketching—was actually the work of little–known French portrait __Marie–Denise Villers (1774–1821).', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"artist–","B":"artist","C":"artist:","D":"artist,"}'::jsonb, NULL, 'B', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '2-18', 18, 'mcq', 'Along the hallowed walls of New York City''s Museum of Modern Art hangs 24.5–by–34.5 inch oil__ which was created in 1964 by American artist Vija Celmins.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"painting Gun with Hand #1","B":"painting, Gun with Hand #1,","C":"painting Gun with Hand #1,","D":"painting, Gun with Hand #1"}'::jsonb, NULL, 'C', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '2-19', 19, 'mcq', 'Legal scholars James Melton and Tom Ginsburg''s analysis of de jure judicial independence and its growth over decades__ six constitutional features that enhance such independence, including judicial tenure and selection procedure. Romania''s constitution contains one of these features.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"have identified","B":"identifies","C":"are identifying","D":"identify"}'::jsonb, NULL, 'B', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '2-20', 20, 'mcq', 'For Spain, a member of the North Atlantic Treaty Organization (NATO) since 1982, NATO''s principle of collective defense confers both benefits and__ organization''s many members, nations as disparate as the US and Slovenia, are all bound to defend Spain, the reverse is also true.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"obligations; the","B":"obligations. The","C":"obligations, while the","D":"obligations: while the"}'::jsonb, NULL, 'D', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '2-21', 21, 'mcq', 'As of 2017, Italy''s top tax rate of 55% was lower than the country''s Laffer curve peak (70%). To some economists, whether a tax cut will ultimately increase Italy''s tax revenue is dependent on the country''s position on the Laffer __ a theoretical relationship between tax rates and revenues, the curve was famously sketched on a napkin by economist Arthur Laffer in 1974.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"curve","B":"curve;","C":"curve, which is","D":"curve,"}'::jsonb, NULL, 'B', NULL, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '2-22', 22, 'mcq', 'Working together with the Navajo Nation Department of Water Resources, Dr. Lani Tsinnajinnie analyzed data about snowpack levels in the Chuska Mountains. She found that the snowpack (the amount of snow on the ground) was deepest in early March at lower elevations. At higher elevations,__ the snowpack was deepest in mid–March.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"in other words,","B":"for instance,","C":"on the other hand,","D":"in summary,"}'::jsonb, NULL, 'C', NULL, NULL, 50)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '2-23', 23, 'mcq', 'Biographer Michael Gorra notes that the novelist Henry James "lived in a world of second thoughts," frequently tinkering with his novels and stories after their initial publication. However, the differences between the 1881 first edition and the 1908 edition of his novel A Portrait of a Lady are extreme, even by James''s standards;__ some critics regard the two editions as two different novels altogether.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"by contrast,","B":"in fact,","C":"nevertheless,","D":"in other words,"}'::jsonb, NULL, 'B', NULL, NULL, 51)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '2-24', 24, 'mcq', 'Scientists studying asteroid deflection have focused on secondary objects such as S/2020 (2013 PY6), a moonlet orbiting the near–Earth asteroid 2013 PY6. In 2022 NASA intentionally crashed a probe into just such an object, successfully altering its orbit. Scientists have yet to demonstrate,__ that 2013 PY6 and other primary objects would be similarly affected.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"for example,","B":"though,","C":"likewise,","D":"moreover,"}'::jsonb, NULL, 'B', NULL, NULL, 52)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '2-25', 25, 'mcq', 'While researching a topic, a student has taken the following notes:
• Documentary TV programs in the slow TV genre consist of uninterrupted broadcasts of ordinary events in real time.
• Nordlandsbanen: Minutt for Minutt is a Norwegian slow TV program.
• The 10–hour–long program documented a train ride from Trondheim to Bodø.
• It first aired in 2012.
• In her book Spectacular Television: Exploring Televisual Pleasure, British film scholar Helen Wheatley writes that slow TV "offers ''Unspectacular'' spectacle."', NULL, 'The student wants to provide a specific example of a slow TV program. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"British film scholar Helen Wheatley writes about the slow TV genre in her book Spectacular Television: Exploring Televisual Pleasure.","B":"An example of the slow TV genre can be seen in Nordlandsbanen: Minutt for Minutt, a 2012 Norwegian show featuring an uninterrupted 10–hour real–time broadcast of a train ride from Trondheim to Bodø.","C":"Slow TV programs provide uninterrupted broadcasts of ordinary events, such as train rides, in real time.","D":"With their uninterrupted broadcasts, slow TV programs offer what film scholar Helen Wheatley calls the \"unspectacular\" spectacle\" of ordinary events occurring in real time."}'::jsonb, NULL, 'B', NULL, NULL, 53)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '2-26', 26, 'mcq', '• Calida Garcia Rawles is an African American painter.
• She is known for her large–scale, hyperrealistic paintings depicting African American figures in water.
• The painting Lightness of Being (24 × 30 in) depicts a young man with his arms outstretched floating on the right side of the canvas.
• Lost in the Shuffle (36 × 24 in) depicts two young men with their arms outstretched floating in the bottom left and upper right corners of the canvas.
• She paints the water with vivid blue colors, including periwinkle and cobalt.
• The mood in the paintings is placid.', NULL, 'Which choice most effectively uses information from the given sentences to emphasize the location of the figures in Lost in the Shuffle?', '{"A":"While the number of figures may differ, constant among Rawles''s hyperrealistic works is the placid mood that the paintings evoke.","B":"In Rawles''s painting Lost in the Shuffle, two young men are depicted in the bottom left and upper right corners of the canvas.","C":"At 36 by 24 inches, Rawles''s Lost in the Shuffle is even larger than the sizable 24–by–30–inch painting Lightness of Being.","D":"Rawles captures the water in paintings such as Lightness of Being and Lost in the Shuffle in vivid hues of periwinkle and cobalt."}'::jsonb, NULL, 'B', NULL, NULL, 54)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '2-27', 27, 'mcq', '• Jean–Michel Basquiat was an American artist who produced more than two thousand drawings and paintings.
• Most of his works were completed in New York City in the 1980s.
• His work Mater was completed in 1982.
• The work is composed of acrylic and oil stick on canvas and measures 72 inches by 84 inches.
• Mater was purchased by a private collection for $5.8 million in a 2009 auction.', NULL, 'Which choice most effectively uses information from the given sentences to emphasize the scope of Basquiat''s work?', '{"A":"Mater is just one of more than two thousand drawings and paintings completed by American artist Jean–Michel Basquiat.","B":"Though artist Jean–Michel Basquiat completed most of his two thousand–plus drawings in the 1980s, his work Mater is composed of acrylic and oil stick on canvas.","C":"At a 2009 auction, artist Jean–Michel Basquiat''s Mater, composed of acrylic and oil stick on canvas, sold for $5.8 million.","D":"Decades after artist Jean–Michel Basquiat completed his 1982 work Mater, a private collection purchased it for $5.8 million."}'::jsonb, NULL, 'A', NULL, NULL, 55)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 3, 'math', 'Math — Module 1', 2100, 22)
  ON CONFLICT (test_id, position) DO UPDATE
    SET section = EXCLUDED.section, label = EXCLUDED.label,
        time_limit_seconds = EXCLUDED.time_limit_seconds,
        question_count = EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '3-1', 1, 'mcq', NULL, NULL, 'The graph of the linear function f is shown, where y = f(x). What is the y-intercept of the graph of f?', '{"A":"(0, 6)","B":"(0, 0)","C":"(0, −4)","D":"(0, −6)"}'::jsonb, '/data/tests/dsat-nov-2023/figures/m3-q1.png', 'D', NULL, NULL, 56)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '3-2', 2, 'mcq', 'Each rock in a collection of 70 rocks was classified as either igneous, metamorphic, or sedimentary, as shown in the frequency table.

Classification | Frequency
igneous | 10
metamorphic | 38
sedimentary | 22', NULL, 'If one of these rocks is selected at random, what is the probability of selecting a rock that is igneous?', '{"A":"10/70","B":"10/60","C":"10/38","D":"10/22"}'::jsonb, NULL, 'A', NULL, NULL, 57)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '3-3', 3, 'mcq', NULL, NULL, 'Each side of square A has a length of 13 inches. Each side of square A is multiplied by a scale factor of 3 to create square B. What is the length, in inches, of each side of square B?', '{"A":"10","B":"13","C":"16","D":"39"}'::jsonb, NULL, 'D', NULL, NULL, 58)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '3-4', 4, 'mcq', NULL, NULL, 'The function f(x) = (1/9)(x − 6)² + 3 gives a toy car''s height above the ground f(x), in inches, x seconds after it started moving on an elevated track, where 0 ≤ x ≤ 10. Which of the following is the best interpretation of the vertex of the graph of y = f(x) in the xy-plane?', '{"A":"The toy car''s minimum height was 3 inches above the ground.","B":"The toy car''s minimum height was 6 inches above the ground.","C":"The toy car''s height was 3 inches above the ground when it started moving.","D":"The toy car''s height was 6 inches above the ground when it started moving."}'::jsonb, NULL, 'A', NULL, NULL, 59)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '3-5', 5, 'mcq', NULL, NULL, 'If 3x = 8, what is the value of 21x?', '{"A":"1","B":"15","C":"31","D":"56"}'::jsonb, NULL, 'D', NULL, NULL, 60)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '3-6', 6, 'mcq', NULL, NULL, 'A car travels at a speed of at least 25 miles per hour but no more than 50 miles per hour for a certain part of a trip. Which inequality represents this situation, where a is the speed of the car, in miles per hour, on this part of the trip?', '{"A":"x ≥ 25","B":"x ≥ 50","C":"25 ≤ x ≤ 50","D":"x ≤ 75"}'::jsonb, NULL, 'C', NULL, NULL, 61)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '3-7', 7, 'mcq', NULL, NULL, 'A list of 10 data values is shown.
10, 14, 22, 6, 24, 26, 14, 8, 8, 8
What is the mean of these data?', '{"A":"8","B":"12","C":"14","D":"20"}'::jsonb, NULL, 'C', NULL, NULL, 62)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '3-8', 8, 'mcq', NULL, NULL, 'f(x) = 7x + 3
The function f gives the estimated height, in feet, of a willow tree a years after its height was first measured. Which statement is the best interpretation of 3 in this context?', '{"A":"The tree will be measured each year for 3 years.","B":"The tree is estimated to grow to a maximum height of 3 feet.","C":"The estimated height of the tree increased by 3 feet each year.","D":"The estimated height of the tree was 3 feet when it was first measured."}'::jsonb, NULL, 'D', NULL, NULL, 63)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '3-9', 9, 'mcq', NULL, NULL, 'Which expression is equivalent to 2x³ + 8x²y + xy² + 4y³ ?', '{"A":"(2x² + 4y)(x + y²)","B":"(2x² + y²)(x + 4y)","C":"(2x³ + y²)(x² + 4y³)","D":"(2x³ + y³)(x + 4y)"}'::jsonb, NULL, 'B', NULL, NULL, 64)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '3-10', 10, 'grid', NULL, NULL, 'f(x) = x³ + 8x + 17
For the given function f, the graph of y = f(x) in the xy-plane passes through the point (0, b), where b is a constant. What is the value of b?', NULL, NULL, NULL, '["17"]'::jsonb, NULL, 65)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '3-11', 11, 'mcq', NULL, NULL, 'Scientists collected fallen acorns that each housed a colony of the ant species P. ohioensis and analyzed each colony''s structure. For any of these colonies, if the colony has a worker ants, the equation y = 0.67x + 2.6, where 20 ≤ x ≤ 110, gives the predicted number of larvae, y, in the colony. If one of these colonies has 35 worker ants, which of the following is closest to the predicted number of larvae in the colony?', '{"A":"114","B":"48","C":"38","D":"26"}'::jsonb, NULL, 'D', NULL, NULL, 66)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '3-12', 12, 'mcq', NULL, NULL, 'b − 49 = x/y
The given equation relates the positive numbers b, x, and y. Which equation correctly expresses x in terms of b and y?', '{"A":"x = (by − 49)/y","B":"x = by − 49y","C":"x = by − 49","D":"x = (b − 49)/y"}'::jsonb, NULL, 'B', NULL, NULL, 67)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '3-13', 13, 'mcq', NULL, NULL, '2y = 5x + 16
−2y = 7x − 22
The solution to the given system of equations is (x, y). What is the value of 24x?', '{"A":"−12","B":"−6","C":"6","D":"12"}'::jsonb, NULL, 'D', NULL, NULL, 68)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '3-14', 14, 'grid', NULL, NULL, '19.5x + 24.25y = 583
Odalys ordered mulch and river rock, which cost a total of $583, for her home. The given equation represents the relationship between the number of cubic yards of mulch, x, and the number of tons of river rock, y, Odalys ordered. How much more, in dollars, did a ton of river rock cost Odalys than a cubic yard of mulch?', NULL, NULL, NULL, '["4.75"]'::jsonb, NULL, 69)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '3-15', 15, 'mcq', NULL, NULL, 'James purchased a certain baseball card on January 1. The function f(x) = 55(1.04)ˣ, where 0 ≤ x ≤ 10, gives the predicted value, in dollars, of the baseball card x years after James purchased it. What is the best interpretation of the statement "f(7) is approximately equal to 72" in this context?', '{"A":"When the baseball card''s predicted value is approximately 72 dollars, it is 7% greater than the predicted value, in dollars, on January 1 of the previous year.","B":"When the baseball card''s predicted value is approximately 72 dollars, it is 7 times the predicted value, in dollars, on January 1 of the previous year.","C":"From the day James purchased the baseball card to 7 years after James purchased the card, its predicted value increased by a total of approximately 72 dollars.","D":"7 years after James purchased the baseball card, its predicted value is approximately 72 dollars."}'::jsonb, NULL, 'D', NULL, NULL, 70)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '3-16', 16, 'mcq', NULL, NULL, 'At what value of x does the graph of y = x² + 18 − 23 reach its minimum in the xy-plane?', '{"A":"−23","B":"−9","C":"9","D":"18"}'::jsonb, NULL, 'B', NULL, NULL, 71)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '3-17', 17, 'mcq', NULL, NULL, 'P(t) = 260(1.03)^((3/2)t)
The function P models the population, in thousands, of a certain city t years after 2009. According to the model, the population is predicted to increase by n% every 8 months. What is the value of n?', '{"A":"0.22","B":"1.03","C":"2","D":"3"}'::jsonb, NULL, 'D', NULL, NULL, 72)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '3-18', 18, 'grid', NULL, NULL, 'How many centimeters are equivalent to 47 meters? (1 meter = 100 centimeters)', NULL, NULL, NULL, '["4700"]'::jsonb, NULL, 73)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '3-19', 19, 'grid', NULL, NULL, 'Circle A has a radius of 3x and circle B has a radius of 135x. The area of circle B is how many times the area of circle A?', NULL, NULL, NULL, '["2025"]'::jsonb, NULL, 74)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '3-20', 20, 'grid', NULL, NULL, 'The graph of a line in the xy-plane passes through the point (1, 5) and crosses the x-axis at the point (9, 0). The line crosses the y-axis at the point (0, b). What is the value of b?', NULL, NULL, NULL, '["45/8","5.625"]'::jsonb, NULL, 75)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '3-21', 21, 'grid', NULL, NULL, 'If 2a/b = 6.5 and a/(bn) = 26, what is the value of n?', NULL, NULL, NULL, '["1/8","0.125",".125"]'::jsonb, NULL, 76)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '3-22', 22, 'mcq', NULL, NULL, 'For two acute angles, ∠Q and ∠R, cos(Q) = sin(R). The measures, in degrees, of ∠Q and ∠R are x + 61 and 4x + 4, respectively. What is the value of x?', '{"A":"5","B":"19","C":"23","D":"29"}'::jsonb, NULL, 'A', NULL, NULL, 77)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 4, 'math', 'Math — Module 2', 2100, 22)
  ON CONFLICT (test_id, position) DO UPDATE
    SET section = EXCLUDED.section, label = EXCLUDED.label,
        time_limit_seconds = EXCLUDED.time_limit_seconds,
        question_count = EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '4-1', 1, 'mcq', NULL, NULL, 'Which expression is equivalent to 14(x² − 6)?', '{"A":"14x² − 84","B":"14x² − 20","C":"14x² − 6","D":"14x² + 8"}'::jsonb, NULL, 'A', NULL, NULL, 78)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '4-2', 2, 'mcq', NULL, NULL, 'A scientist analyzed a soil sample with a mass of 900 grams and determined that it contained 189 grams of water. What is the percentage of water, by mass, in this soil sample?', '{"A":"9%","B":"9.9%","C":"18.9%","D":"21%"}'::jsonb, NULL, 'D', NULL, NULL, 79)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '4-3', 3, 'mcq', NULL, NULL, 'x + 5 = 11
y = 3x² + 3
At what point (x, y) do the graphs of the equations in the given system intersect?', '{"A":"(6, 108)","B":"(6, 111)","C":"(11, 3)","D":"(11, 366)"}'::jsonb, NULL, 'B', NULL, NULL, 80)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '4-4', 4, 'grid', NULL, NULL, 'If (6/7)p + 42 = 84, what is the value of 7p?', NULL, NULL, NULL, '["343"]'::jsonb, NULL, 81)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '4-5', 5, 'mcq', NULL, NULL, 'If 5(x + 4) = 4(x + 4) + 58, what is the value of x + 4?', '{"A":"−4","B":"54","C":"58","D":"62"}'::jsonb, NULL, 'C', NULL, NULL, 82)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '4-6', 6, 'mcq', NULL, NULL, 'Circle N has a radius of 6 millimeters (mm). Circle M has an area of 121π mm². What is the total area, in mm², of circles N and M?', '{"A":"17π","B":"133π","C":"145π","D":"157π"}'::jsonb, NULL, 'D', NULL, NULL, 83)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '4-7', 7, 'mcq', NULL, NULL, 'What is the slope of the graph of y = (1/4)(27x + 12) + 7x in the xy-plane?', '{"A":"27/4","B":"55/4","C":"27","D":"34"}'::jsonb, NULL, 'B', NULL, NULL, 84)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '4-8', 8, 'mcq', NULL, NULL, 'The function f is defined by f(x) = (x + 16)/5, and f(a) = −19, where a is a constant. What is the value of a?', '{"A":"−111","B":"−79","C":"−79/5","D":"−3/5"}'::jsonb, NULL, 'A', NULL, NULL, 85)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '4-9', 9, 'mcq', NULL, NULL, 'A data set of the orbital periods, rounded to the nearest whole number of Earth days, for 13 of Jupiter''s moons is represented in the dot plot. An additional moon with an orbital period of 251 days is added to the original data set to create a new data set of 14 orbital periods. Which statement best compares the mean and median of the new data set to the mean and median of the original data set?', '{"A":"The mean of the new data set is equal to the mean of the original data set, and the median of the new data set is equal to the median of the original data set.","B":"The mean of the new data set is equal to the mean of the original data set, and the median of the new data set is less than the median of the original data set.","C":"The mean of the new data set is less than the mean of the original data set, and the median of the new data set is less than the median of the original data set.","D":"The mean of the new data set is less than the mean of the original data set, and the median of the new data set is equal to the median of the original data set."}'::jsonb, '/data/tests/dsat-nov-2023/figures/m4-q9.png', 'D', NULL, NULL, 86)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '4-10', 10, 'mcq', NULL, NULL, 'For the linear function p, p(c) = −2, where c is a constant, p(5) = 34, and the slope of the graph of y = p(x) in the xy-plane is 6. For the linear function t, t(c) = −4 and t(6) = 52. What is the slope of the graph of y = t(x) in the xy-plane?', '{"A":"−1","B":"4","C":"6","D":"8"}'::jsonb, NULL, 'D', NULL, NULL, 87)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '4-11', 11, 'grid', NULL, NULL, '18x² − 24x + c = 0
In the given equation, c is a constant. The equation has exactly one solution. What is the value of c?', NULL, NULL, NULL, '["8"]'::jsonb, NULL, 88)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '4-12', 12, 'mcq', NULL, NULL, 'A conservation specialist hung artificial nesting structures each in the shape of a right rectangular prism for a species of native owl. Each structure has a height of 11 inches. The length of each structure''s base is x inches, which is 1 inch more than the width of the structure''s base. Which function V gives the volume of each structure, in cubic inches, in terms of the length of the structure''s base?', '{"A":"V(x) = 11x(x − 1)","B":"V(x) = 11x(x + 1)","C":"V(x) = x(x + 11)(x − 1)","D":"V(x) = x(x + 11)(x + 1)"}'::jsonb, NULL, 'A', NULL, NULL, 89)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '4-13', 13, 'grid', NULL, NULL, '(x + 1)/(5x²) = k/x
In the given equation, k is a constant. The solution to the given equation is 1/224. What is the value of k?', NULL, NULL, NULL, '["45"]'::jsonb, NULL, 90)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '4-14', 14, 'mcq', NULL, NULL, 'The function f is defined by f(x) = −39ˣ. The function g is a decreasing linear function. In the xy-plane, the graphs of y = f(x) and y = g(x) intersect at two points, (h, j) and (k, m), where j > m. When g(x) < f(x), which of the following must also be true?', '{"A":"x > k","B":"x < h","C":"x > k or x < h","D":"h < x < k"}'::jsonb, NULL, 'D', NULL, NULL, 91)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '4-15', 15, 'mcq', NULL, NULL, 'One gallon of sealant costs $29 and will cover 300 square feet of a surface. A deck has a total surface area of d square feet. Which equation represents the cost c, in dollars, of the sealant needed to cover the deck twice?', '{"A":"c = 300d/29","B":"c = 600d/29","C":"c = 29(d/150)","D":"c = 29(d/300)"}'::jsonb, NULL, 'C', NULL, NULL, 92)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '4-16', 16, 'grid', NULL, NULL, 'A triangular prism has a height of 9 centimeters (cm) and a volume of 234 cm³. What is the area, in cm², of the base of the prism? (The volume of a triangular prism is equal to Bh, where B is the area of the base and h is the height of the prism.)', NULL, NULL, NULL, '["26"]'::jsonb, NULL, 93)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '4-17', 17, 'grid', NULL, NULL, 'An area of 56.00 square nautical miles is equivalent to k square kilometers. To the nearest tenth, what is the value of k? (1 nautical mile = 1.852 kilometers)', NULL, NULL, NULL, '["192.1"]'::jsonb, NULL, 94)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '4-18', 18, 'grid', NULL, NULL, 'A circle in the xy-plane has its center at (−7, 3) and has a radius of 9. An equation of this circle is x² + y² + ax + by + c = 0, where a, b, and c are constants. What is the value of c?', NULL, NULL, NULL, '["-23"]'::jsonb, NULL, 95)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '4-19', 19, 'mcq', NULL, NULL, 'y = x − c
y = −4(x − 6)²
In the given system of equations, c is a constant. The system has two distinct real solutions. Which of the following could be the value of c?', '{"A":"1","B":"5","C":"95/16","D":"11"}'::jsonb, NULL, 'D', NULL, NULL, 96)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '4-20', 20, 'mcq', NULL, NULL, 'The functions f and g are defined by the equations shown, where a and b are integer constants, a < b and b < 0. If y = f(x) and y = g(x) are graphed in the xy-plane, which of the following equations displays, as a constant or coefficient, the y-coordinate of the y-intercept of the graph of the corresponding function?
I. f(x) = a(4.2)^(x+b)
II. g(x) = a(4.2)^x + b', '{"A":"I only","B":"II only","C":"I and II","D":"Neither I nor II"}'::jsonb, NULL, 'D', NULL, NULL, 97)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '4-21', 21, 'mcq', NULL, NULL, '5x + 4y = 3
15x + 12y = 9
For each real number r, which of the following points lies on the graph of each equation in the xy-plane for the given system?', '{"A":"(r, −4r/5 + 3/5)","B":"(r, 5r/4 + 3/4)","C":"(−4r/5 + 3/5, r)","D":"(r/3 + 3, −r/3 + 9)"}'::jsonb, NULL, 'C', NULL, NULL, 98)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '4-22', 22, 'mcq', NULL, NULL, 'In triangle ABC and triangle DEF, sides AB and DE each have a side length of 10 inches, and angles A and D each have an angle measure of 40°. Which of the following additional pieces of information is(are) sufficient to prove whether triangle ABC is congruent to triangle DEF?
I. The measures of angles B and C are equal.
II. The lengths of sides AC and DF are equal.
III. The lengths of sides BC and EF are equal.', '{"A":"I is sufficient, but II and III are not.","B":"II is sufficient, but I and III are not.","C":"III is sufficient, but I and II are not.","D":"II is sufficient and III is sufficient, but I is not."}'::jsonb, NULL, 'B', NULL, NULL, 99)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
END $seed$;
