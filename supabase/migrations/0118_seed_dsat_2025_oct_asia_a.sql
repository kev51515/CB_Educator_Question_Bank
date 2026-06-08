-- =============================================================================
-- Migration: 0118_seed_dsat_2025_oct_asia_a.sql
-- Purpose:   Seed "Test #5 — Digital SAT, October 2025 (Asia-Pacific, Form A)"
--            into the full-test tables from 0048.
--
--   Source:  2025-10-asia-a.pdf (Two Engineers Prep, Bluebook-format reconstruction).
--            Image-only PDF (no text layer, NO printed answer key); questions
--            OCR'd from page renders, answer key SOLVED + reviewed by Claude
--            (Math derivable with near-certainty; RW solved and cross-checked).
--   Idempotent: upserts on (slug) / (test_id, position) / (module_id, position).
--   Answer key + question text live ONLY here / in Postgres — never web-served.
-- =============================================================================

DO $seed$
DECLARE
  v_test uuid;
  v_mod  uuid;
BEGIN
  INSERT INTO public.tests (slug, ordinal, title, short_title, source, total_questions)
  VALUES ('dsat-2025-oct-asia-a', 5, 'Test #5 — Digital SAT, October 2025 (Asia-Pacific, Form A)', 'DSAT Oct 2025 Asia A', '2025-10-asia-a.pdf', 98)
  ON CONFLICT (slug) DO UPDATE
    SET ordinal = EXCLUDED.ordinal, title = EXCLUDED.title,
        short_title = EXCLUDED.short_title, source = EXCLUDED.source,
        total_questions = EXCLUDED.total_questions
  RETURNING id INTO v_test;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 1, 'reading-writing', 'Reading and Writing — Module 1', 1920, 27)
  ON CONFLICT (test_id, position) DO UPDATE
    SET section = EXCLUDED.section, label = EXCLUDED.label,
        time_limit_seconds = EXCLUDED.time_limit_seconds, question_count = EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '1-1', 1, 'mcq', 'The National Heritage Fellowship was created to ______ exceptional folk and traditional artists in the United States. One artist who received the fellowship, the taiko drummer Seiichi Tanaka, was chosen for his lifetime contributions to the arts.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"overshadow","B":"begin","C":"distract","D":"honor"}'::jsonb, NULL, 'D', NULL, NULL, 2)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '1-2', 2, 'mcq', 'Broods of periodical cicadas (inch-long winged insects) emerge for six weeks in late spring on a cycle of either 13 or 17 years. In 2024, the emergence of the Great Southern Brood (on a 13-year cycle) and the Northern Illinois Brood (on a 17-year cycle) coincided in the Midwest and Southeast United States, ______ that happens only once every 221 years. Sixteen states were covered with a trillion cicadas.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"a division","B":"a convergence","C":"an expiration","D":"a succession"}'::jsonb, NULL, 'B', NULL, NULL, 3)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '1-3', 3, 'mcq', 'Japanese animator and director Hayao Miyazaki often includes fantasy elements in otherwise realistic settings in his movies, but he tends to ______ details and exposition about those elements. Miyazaki simply presents fantastical characters and actions with little backstory or explanation, encouraging viewers to embrace the presence of the extraordinary in everyday life.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"invent","B":"combine","C":"celebrate","D":"withhold"}'::jsonb, NULL, 'D', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '1-4', 4, 'mcq', 'The following text is from Charles Chesnutt''s 1905 novel The Colonel''s Dream. Mr. French and Mr. Kirby work together.

Mr. French, the senior partner, who sat opposite Kirby, was an older man—a safe guess would have placed him somewhere in the debatable ground between forty and fifty; of a good height, as could be seen even from the seated figure, the upper part of which was held erect with the unconscious ease which one associates with military training.', NULL, 'As used in the text, what does the word "good" most nearly mean?', '{"A":"Reliable","B":"Courteous","C":"Considerable","D":"Capable"}'::jsonb, NULL, 'C', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '1-5', 5, 'mcq', 'Portoviejo, Ecuador, was named a City of Gastronomy by UNESCO in 2019, a title that ______ Portoviejo has a unique and vibrant food culture worthy of celebration.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"discovers","B":"renounces","C":"complains","D":"denotes"}'::jsonb, NULL, 'D', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '1-6', 6, 'mcq', 'Svante Pääbo and other researchers studying the history of organisms have long utilized ancient DNA — DNA recovered from ancient organic material that has been preserved under natural conditions. However, J. Mason Heberling and David J. Burke''s 2019 study of the evolutionary trajectory of arbuscular mycorrhizal fungi instead relied on historical DNA — genomic data incidentally preserved in specimens that are housed in natural history collections — thus capitalizing on the research potential offered by a vast but hitherto relatively underutilized source of insight into the biological past.', NULL, 'Which choice best describes the function of the underlined portion in the text as a whole?', '{"A":"It specifies potential applications of the approach that Heberling and Burke used in their study.","B":"It explains why the research methodology selected by Heberling and Burke is not widely used.","C":"It emphasizes the importance of Heberling and Burke''s findings about the DNA of fungi.","D":"It offers commentary on the significance of the approach that Heberling and Burke''s colleagues used for their study."}'::jsonb, NULL, 'A', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '1-7', 7, 'mcq', 'Curious about how people visually perceive objects in their dreams, Stephen LaBerge and team recruited lucid dreamers — people aware that they''re dreaming as it''s happening — for a research study. These participants were reliably able to signal when they had entered a dream state; the team then observed participants eye movements as they slept. The smoothness with which participants'' eyes tracked objects in their dreams closely matched how sighted people who are awake visually track objects around them, suggesting to the team that the brain perceives dream objects as the product of something other than pure imagination.', NULL, 'Which choice best states the function of the underlined portion in the text as a whole?', '{"A":"To illustrate an important real-world implication of LaBerge and team''s main finding","B":"To offer key evidence that undermines LaBerge and team''s initial hypothesis","C":"To show the unexpected result that led LaBerge and team to change the focus of their study","D":"To identify a comparable circumstance that helps justify LaBerge and team''s conclusion"}'::jsonb, NULL, 'D', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '1-8', 8, 'mcq', 'Text 1
Thomas Piketty''s book Capital in the Twenty-First Century has a more rigorous structure than its sequel, Capital and Ideology. While the first book''s chapters all contribute to bolstering a clear, coherent argument about income inequality, the second book''s digressions on subjects such as an analysis of Hayao Miyazaki''s film The Wind Rises do not just make the book tedious but also muddy its reasoning.

Text 2
Capital and Ideology has different aims than Piketty''s earlier books. It should be judged not just in the context of Piketty''s previous work but placed next to books like William T. Vollmann''s Rising Up and Rising Down, in which the stated theme of justifications for violent acts is mainly an excuse for a polymath to map his own mind. Even when sections do not explicitly support the central thesis, they link to each other in intriguing ways. None of them should be considered extraneous.', NULL, 'Based on the texts, the author of Text 1 would most likely agree with the author of Text 2 on which point?', '{"A":"Capital and Ideology is notably different in structure from some of Piketty''s earlier work.","B":"Capital in the Twenty-First Century is a superior book to Capital and Ideology.","C":"The material in Capital and Ideology on The Wind Rises is essential to the book.","D":"Capital and Ideology was influenced by the writing of William T. Vollmann."}'::jsonb, NULL, 'A', NULL, NULL, 9)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '1-9', 9, 'mcq', 'Musician and astronomer Darsan Swarop Bellie researches gravitational waves. These invisible waves move very quickly through space. They cannot be viewed through a telescope, but they do make sounds that can be detected with special equipment. In his musical composition Dance of the Black Holes, Bellie demonstrates what gravitational waves might sound like as two black holes merge in space. With this composition and others, Bellie hopes to make aspects of science more accessible.', NULL, 'According to the text, what is the subject of Bellie''s research?', '{"A":"Ocean currents","B":"Music history","C":"Space travel","D":"Gravitational waves"}'::jsonb, NULL, 'D', NULL, NULL, 10)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '1-10', 10, 'mcq', 'The End-Triassic mass extinction happened approximately 201 million years ago, when about 80 percent of species (including many species of bivalves) died off. Researchers have proposed the effects of a sudden release of carbon dioxide as one mechanism that may have brought on this mass extinction. But mass extinctions, while abrupt in geological terms, unfold over thousands or millions of years: it''s likely that multiple factors drove widespread species loss.', NULL, 'Based on the text, the author would most likely agree with which statement about the End-Triassic mass extinction?', '{"A":"It likely involved the extinction of more species than is typically believed.","B":"It is hard to detect in Earth''s fossil or geological records.","C":"It occurred over a long period of time and probably had multiple causes.","D":"It was discovered only recently and is poorly understood."}'::jsonb, NULL, 'C', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '1-11', 11, 'mcq', 'The following text is from Yung Wing''s 1909 memoir My Life in China and America.

We landed in New York on the 12th of April, 1847, after a passage of ninety-eight days of unprecedented fair weather. The New York of 1847 was altogether a different city from the New York of 1909. It was a city of only 250,000 or 300,000 inhabitants; now it is a metropolis rivaling London in population, wealth and commerce. The whole of Manhattan Island is turned into a city of skyscrapers, churches and palatial residences.', NULL, 'Which choice best states the main idea of the text?', '{"A":"Yung has experienced significant personal growth in the time since his arrival to New York City in 1847.","B":"The journey to New York City was extremely tiring for Yung.","C":"The architecture in New York City is more beautiful than that in London.","D":"New York City has become more developed and populated since Yung''s arrival in 1847."}'::jsonb, NULL, 'D', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '1-12', 12, 'mcq', 'Memoirs of Elleanor Eldridge is an 1838 historical account by Elleanor Eldridge and Frances Harriet Whipple Green. In the book, the authors assert that all people naturally have an emotional attachment to where they live, writing ______', NULL, 'Which quotation from Memoirs of Elleanor Eldridge most effectively illustrates the claim?', '{"A":"\"Let us, dear reader, remember the punishment of idle curiosity, as taught in the true and affecting history [named] ''Blue Beard;'' and, striving to be content with the facts in the case, seek not to lift the veil, which the sensibility of true love, and feminine delicacy, have alike conspired to draw.\"","B":"\"There is often a kind of [deceptive] light, playing around such [famous] names, calculated to dazzle and mislead, by their false lustre, until the eye can no longer receive the pure light of truth, or the mind appreciate real excellence, or intrinsic worth.\"","C":"\"Home is home, to the lowly as well as the great; and no rank, or color, destroys its sacred character, its power over the mind, and the affections.\"","D":"\"Blessed are the slumbers of the innocent. They are kindlier than balm, and they refresh and gladden the spirit of childhood, like ministerings from a better world.\""}'::jsonb, NULL, 'C', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '1-13', 13, 'mcq', 'Mean Body Mass of Birds Known to Perform Broken-Wing Display

Bird | Mean body mass (grams)
pied-billed grebe | 409
common ringed plover | 60
common snipe | 126

One antipredator defense that the grey-headed lapwing uses to protect its nest and young chicks is called "broken-wing display"; this form of deceptive defense involves an adult bird pretending to be injured and unable to fly in order to distract an approaching predator. Broken-wing display has been documented in 285 bird species from 13 different avian orders. A student predicts that bird species with mean body masses greater than 150 grams do not use deceptive defenses because larger birds tend to be more effective than smaller birds at using aggressive defenses to protect nests from predators, making defenses unnecessary.', NULL, 'Which choice most effectively uses data from the table that weaken the student''s prediction?', '{"A":"The common snipe and the common ringed plover both have a mean body mass under 150 grams and use broken-wing display.","B":"The common ringed plover uses broken-wing display, but the pied-billed grebe does not.","C":"The pied-billed grebe has a mean body mass of 409 grams and is known to perform broken-wing display.","D":"The ruddy turnstone uses broken-wing display even though it is larger than the swamp palm bulbul."}'::jsonb, NULL, 'C', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '1-14', 14, 'mcq', 'Antonia Olivia Dolan and colleagues conducted a study of participants'' preferred listening volume, in decibels (dB), for various audio recordings, including pop music, classic rock music, and nature sounds. The team found that participants listened to recordings they liked most at higher volumes (greater dB) than recordings they liked less and that musicians tended to listen at higher volumes than nonmusicians did. For example, if the favorite recording of both a participating musician and a participating nonmusician was Beyoncé''s "Crazy in Love" and the musician played it at 84.8 dB, it was therefore likely that ______', NULL, 'Which choice most logically completes the text?', '{"A":"the nonmusician would play \"Crazy in Love\" at greater than 84.8 dB.","B":"the musician and nonmusician would both play other music by Beyoncé at approximately 84.8 dB.","C":"the nonmusician would play \"Crazy in Love\" at less than 84.8 dB.","D":"the nonmusician would not play music in the heavy metal genre at less than 84.8 dB."}'::jsonb, NULL, 'C', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '1-15', 15, 'mcq', 'Right-handedness is overwhelmingly prevalent in humans. Among studies of laterality in nonhuman primates, William C. McGrew and colleagues'' 1999 study of wild chimpanzees reported no tendency toward right-handedness, while Mara Aruguete and colleagues'' 1992 study of captive chimpanzees and squirrel monkeys did. However, the latter study included only 27 individuals, and a meta-analysis of primate-laterality studies demonstrated that a minimum sample size of 176 individuals is required to be confident that a finding of population-level handedness is not mere statistical noise. The claim of right handedness in the 1992 study should therefore be treated skeptically given that ______', NULL, 'Which choice most logically completes the text?', '{"A":"right-handedness does not occur frequently enough among chimpanzees and squirrel monkeys to reliably appear in a sample of only 27 individuals.","B":"the study that did not find right-handedness in chimpanzees was also based on an insufficient population size.","C":"the sample size on which the claim is based is far below the threshold identified in the meta-analysis.","D":"the apparent difference between the two studies'' results may be partly attributable to the 1999 study using a different standard to determine handedness than the 1992 study did."}'::jsonb, NULL, 'C', NULL, NULL, 16)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '1-16', 16, 'mcq', '"What stories like this do for us is make the world just a smidge bigger," writes Stephen Graham Jones in the foreword to Never Whistle at Night: An Indigenous Dark Fiction Anthology. For Jones, dark fiction does more than entertain readers: ______ horror tropes to challenge familiar ways of knowing, blurring the "borders of the real."', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"they use","B":"it uses","C":"we use","D":"one uses"}'::jsonb, NULL, 'B', NULL, NULL, 17)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '1-17', 17, 'mcq', 'Louisiana resident Caesar Antoine, one of the nearly two thousand African Americans elected to public office during the decade that followed the Civil War, ______ his term as lieutenant governor in 1873.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"having begun","B":"began","C":"to begin","D":"beginning"}'::jsonb, NULL, 'B', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '1-18', 18, 'mcq', 'Mary Cassatt and Edith Haworth were among the 300 artists who exhibited at the 1913 Armory Show, a groundbreaking New York City art exhibition that introduced modernism to American audiences. Marcel Duchamp''s abstract cubist aesthetic received the most skepticism from critics, as ______ represented a radical departure from the more realistic painting style that was popular at the time.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"we","B":"it","C":"they","D":"these"}'::jsonb, NULL, 'B', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '1-19', 19, 'mcq', 'The International Wheelchair Basketball Federation (IWBF) is one of many sports organizations that collect and analyze data on player performance. Coaches in the IWBF ______ these data to help them develop game strategies that have a high probability of success.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"has used","B":"uses","C":"is using","D":"use"}'::jsonb, NULL, 'D', NULL, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '1-20', 20, 'mcq', 'Polymers used in industrial applications are weakened by environmental stress, mechanical fatigue, and unexpected damage. However, new types of polymers have been engineered to repair ______ aided by embedded microcapsules, such materials begin to self heal.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"themselves — upon fracture —","B":"themselves. Upon fracture,","C":"themselves upon fracture,","D":"themselves, upon fracture,"}'::jsonb, NULL, 'B', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '1-21', 21, 'mcq', 'Many past Olympic Games featured demonstration sports—nonmedal events—to showcase sports related to the host country. These events included sumō, a Japanese form of wrestling, and pärkspel, a Swedish ball sport. ______ they were chosen as demonstration sports at the Olympic Games in Tokyo, Japan, and Stockholm, Sweden, respectively.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Fittingly,","B":"Additionally,","C":"Nevertheless,","D":"By contrast,"}'::jsonb, NULL, 'A', NULL, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '1-22', 22, 'mcq', 'A team led by Portuguese researcher Isabel C. F. R. Ferreira found that many species of mushrooms contain chemicals called phenolic compounds, such as protocatechuic acid and biochanin. ______ Ferreira detected protocatechuic acid in Agaricus bisporus mushrooms and biochanin in Ganoderma lucidum mushrooms.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Nevertheless,","B":"However,","C":"For this reason,","D":"For example,"}'::jsonb, NULL, 'D', NULL, NULL, 23)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '1-23', 23, 'mcq', 'In Amarna, Egypt, archaeologist Anna Hodgkinson unearthed bits of glass near lower-status dwellings, which she believes may refute the long-held notion that the material was enjoyed exclusively by Ancient Egyptian royalty. ______ archaeologist Thilo Rehren states flatly that glass doesn''t appear to have been "a closely controlled royal commodity," concurring, based on his own research, that the material was more common than once surmised.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Consequently,","B":"Nonetheless,","C":"As such,","D":"Likewise,"}'::jsonb, NULL, 'D', NULL, NULL, 24)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '1-24', 24, 'mcq', 'While researching a topic, a student has taken the following notes:
• The wedge-rumped storm petrel is a species of bird.
• It has an average weight of 23 grams.
• It can be found on the Galápagos Island of Marchena.
• The Galápagos Islands are a group of islands that have many different species of birds.', NULL, 'The student wants to specify the average weight of the wedge-rumped storm petrel. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"The wedge-rumped storm petrel can be found on the Galápagos Islands of Marchena.","B":"The Galápagos Islands, which include the island of Marchena, contain many different species of birds.","C":"Many species of birds can be found in the Galápagos Islands, including the large tree finch.","D":"The large tree finch has an average weight of 19 grams."}'::jsonb, NULL, 'A', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '1-25', 25, 'mcq', 'While researching a topic, a student has taken the following notes:
• The willow oak is a species of deciduous tree.
• Its scientific name is Quercus phellos.
• It is native to the Southeastern ecoregion of the US.', NULL, 'The student wants to indicate which ecoregion the willow oak is native to. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"The willow oak is native to the Southeastern ecoregion of the US.","B":"The willow oak (Quercus phellos) is a species of deciduous tree.","C":"The willow oak''s scientific name is Quercus phellos.","D":"Deciduous trees are native to several ecoregions of the US."}'::jsonb, NULL, 'A', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '1-26', 26, 'mcq', 'While researching a topic, a student has taken the following notes:
• In music theory, the term "key" refers to the set of musical notes that forms the foundation of a piece of music.
• In Régies de Composition (1682), French composer Marc-Antoine Charpentier describes the mood of various musical keys.
• He describes the key of G major as "serious and magnificent."
• "Hero" (2001) by Enrique Iglesias is a song written in G major.', NULL, 'The student wants to explain how Charpentier describes G major. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"The key of G major is one of various keys, which are sets of musical notes that form the foundations of pieces of music.","B":"In Régies de Composition, Charpentier describes the mood of G major as \"serious and magnificent.\"","C":"In Régies de Composition, Charpentier describes the mood of G major.","D":"The song \"Hero\" could be described as expressing \"serious and magnificent.\""}'::jsonb, NULL, 'B', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '1-27', 27, 'mcq', 'While researching a topic, a student has taken the following notes:
• Kumiko is a Japanese woodworking technique in which thin strips of wood are interlaced to create latticed panels that incorporate intricate patterns.
• These wooden strips are fit together without the use of nails or other fasteners.
• Many of the geometric patterns used in kumiko designs are inspired by elements from nature.
• The overlapping hexagons of the kikko pattern resemble a tortoise''s shell.
• The curved fan shapes of the seigaiha pattern resemble ocean waves.', NULL, 'The student wants to make and support a claim about the inspiration for kumiko patterns. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Like the seigaiha pattern''s curved fan shapes, which resemble ocean waves, many of the geometric patterns used in kumiko designs are inspired by elements from nature.","B":"The kumiko woodworking technique is used to create latticed panels with geometric designs, like overlapping hexagons, out of thin strips of wood.","C":"The tortoiseshell-like overlapping hexagons of the kikko pattern are inspired by wooden strips from nature.","D":"Often resembling elements from nature, kumiko patterns are formed by fitting thin strips of wood together without the use of nails."}'::jsonb, NULL, 'A', NULL, NULL, 28)
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
        time_limit_seconds = EXCLUDED.time_limit_seconds, question_count = EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '2-1', 1, 'mcq', 'In some of his sculptures, Allan Houser uses abstract geometric shapes to depict his subjects rather than portraying them in realistic detail. For instance, his 1989 work Embrace is highly abstract and therefore differs strikingly from some of his other pieces in which the viewer can easily ______ familiar objects.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"ignore","B":"identify","C":"reveal","D":"remember"}'::jsonb, NULL, 'B', NULL, NULL, 30)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '2-2', 2, 'mcq', 'Players of online games are largely aware that the games collect their data, and they''re often willing to trade some privacy for a fun experience. But the games are often quite ______ about what data they collect and why. Because of this, data-privacy advocates are seeking to expand online players'' knowledge of data collection practices and improve their ability to navigate privacy-setting features in games.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"abrasive","B":"outspoken","C":"opaque","D":"ambivalent"}'::jsonb, NULL, 'C', NULL, NULL, 31)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '2-3', 3, 'mcq', 'Described in treatises mainly published between 1768 and 1950 (such as W. D. Dunton''s Dunton''s Musical Shorthand), musical stenography used quickly written squiggles and dots in an attempt to preserve, in printand in real time, the ______ features of live performances — those that result from impromptu deviations of performers when fidelity to an established musical score is not mandated.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"inevitable","B":"extemporaneous","C":"inconspicuous","D":"meticulous"}'::jsonb, NULL, 'B', NULL, NULL, 32)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '2-4', 4, 'mcq', 'The following text is from Edward Gibbon''s 1796 Memoirs of My Life and Writings. Gibbon reflects on publishing a volume of his series The History of the Decline and Fall of the Roman Empire.

I am at a loss how to describe the success of the work, without betraying the vanity of the writer. The first impression was exhausted in a few days; a second and third edition were scarcely adequate to the demand.', NULL, 'As used in the text, what does the word "betraying" most nearly mean?', '{"A":"Exploiting","B":"Exposing","C":"Forsaking","D":"Distorting"}'::jsonb, NULL, 'B', NULL, NULL, 33)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '2-5', 5, 'mcq', 'Harold Newton''s Yellow Day, a wetland landscape with palm trees and lush greenery set against the pastel yellows and pinks of the sky and water, is typical of paintings by the Florida Highwaymen, loosely affiliated landscape artists mainly active in Fort Pierce, Florida, during the 1950s and ''60s. Some art historians suggest that Highwaymen paintings played a role in shaping popular perceptions of the state that persist today: the natural iconography that Newton and colleagues constantly revisited—lush tropical forests, vivid sunsets—is now seen as classically Floridian.', NULL, 'Which choice best states the main purpose of the text?', '{"A":"To explain that a particular painting by Harold Newton has had greater influence on the broader culture of the state of Florida than is generally acknowledged","B":"To contrast the public''s reaction during the 1950s and ''60s to a particular painting by Harold Newton with more recent reactions to it","C":"To note that paintings by the Florida Highwaymen experienced a resurgence in popularity","D":"To present the argument that paintings by the Florida Highwaymen likely helped to create a particular widespread impression of Florida"}'::jsonb, NULL, 'D', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '2-6', 6, 'mcq', 'The metal featured in both the structure of the Shimogamo Machiya Villa by Takuma Ohira and the hardware in the One-Room Residence of 5 Layers by Matsuyama Architect and Associates is representative of a trend in contemporary Japanese interior design to juxtapose sleek, modern accents with traditional organic materials such as cypress. The prominent featuring of metal stems from the post-World War II emphasis on technological progress, while more traditional natural materials help preserve longstanding architectural and aesthetic approaches.', NULL, 'Which choice best describes the overall structure of the text?', '{"A":"The text names projects that are noteworthy for their inclusion of certain materials and then explains past important uses of the materials.","B":"The text introduces the salient characteristics of two buildings and then details the historical events that occasioned the buildings'' designs.","C":"The text cites examples of a design trend and then briefly establishes the principles underlying the trend.","D":"The text distinguishes between two aesthetic approaches to architecture and then submits that one approach has had more of a long-term impact than the other has had."}'::jsonb, NULL, 'C', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '2-7', 7, 'mcq', 'Text 1
For decades, ornithologists assumed that if they saw a singing house wren — a bird species found in temperate North America — they must be observing a male trying to attract a mate or claim territory. As Peter J. B. Slater and Nigel I. Mann have emphasized, however, a similar assumption can''t be made about birds in the tropics, where females sing as often as males do. Slater and Mann call for more research on this discrepancy between tropical and temperate female birdsong.

Text 2
Recent evidence shows that a female house wren is as capable of song as a male is. In fact, female birdsong is more common among temperate species than currently assumed, claim Evangeline Rose and colleagues. These female songbirds sing less frequently than males do, and in duller tones, making it "easy for researchers to miss the quiet and hidden females and focus on the loud and colorful males," says Rose.', NULL, 'Based on the texts, how would Rose and colleagues (Text 2) most likely respond to the assertion by Slater and Mann (Text 1) about the different prevalence of female birdsong in temperate and tropical areas?', '{"A":"They would raise the possibility that the difference in prevalence may be due to differences in the timing of the mating season among temperate and tropical bird species.","B":"They would concede that the geographic difference in prevalence is real but argue that the frequency with which male tropical birds sing has been overstated by previous researchers.","C":"They would argue that the apparent difference in prevalence may partly reflect a difference in the ease with which female birdsong and male birdsong can be detected.","D":"They would caution that the seeming difference in prevalence may be an artifact of researchers'' tendency to study birdsong among temperate species more frequently than among tropical species."}'::jsonb, NULL, 'C', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '2-8', 8, 'mcq', 'The following text is from Nathaniel Hawthorne''s 1830 short story "Sir William Phips."

The knowledge, communicated by the historian and biographer, is analogous to that which we acquire of a country by the map,—minute, perhaps, and accurate, and available for all necessary purposes, but cold and naked, and wholly destitute of the mimic charm produced by landscape painting. These defects are partly remediable, and even without an absolute violation of literal truth, although by methods rightfully interdicted to professors of biographical exactness.', NULL, 'Which choice best states the main idea of the text?', '{"A":"Historians should not worry if their readers believe they are embellishing the truth.","B":"Historians'' fidelity to the truth often results in work that is less engaging than it could be.","C":"Historians do not agree among themselves about the best methods of recording history.","D":"Maps are more practical to own than paintings."}'::jsonb, NULL, 'B', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '2-9', 9, 'mcq', 'Impact of Four Key Industries on Oklahoma Economy in 2017

Industry | Approximate total contribution by industry | Number of people employed by industry
Wholesale trade | $10,723,400,000 | 58,346
Construction | $6,797,700,000 | 77,247
Tribal economic activity | $7,312,100,000 | 71,674
Transportation/warehousing | $2,414,600,000 | 32,891

The nearly forty tribes located in Oklahoma, including the Cherokee Nation and the Seminole Nation, operate numerous businesses and generate billions of dollars in revenue. A student in an economics class is researching the tribes'' collective activity as a single industry. The student wants to compare that industry''s contribution to Oklahoma''s overall economy in 2017 with the contributions made by three other industries in the state. Looking at the table, the student finds that tribal economic activity totaled over $7.3 billion, ranking it above ______', NULL, 'Which choice most effectively uses data from the table to complete the comparison?', '{"A":"construction and nearly equal to transportation/warehousing and wholesale trade.","B":"both construction and wholesale trade but below transportation/warehousing.","C":"transportation/warehousing, wholesale trade, and construction.","D":"construction but below both transportation/warehousing and wholesale trade."}'::jsonb, NULL, 'C', NULL, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '2-10', 10, 'mcq', 'Average Ratings of Perceived Personality Traits of Dogs and Human Willingness to Keep or Interact with Them
Image ID | Irises | Not friendly (0)–Friendly (5) | Immature (0)–Mature (5) | Would not keep (0)–Would keep (3) | Would not interact with (0)–Would interact with (3)
24 | light | 2.67 | 4.03 | 1.4 | 1.7
14 | light | 2.11 | 3.27 | 1.55 | 1.85
6 | dark | 4.03 | 2.95 | 1.85 | 2.15
3 | dark | 3.88 | 2.51 | 2.35 | 2.65
Studies have found that when looking at other people''s eyes, humans tend to perceive dilated pupils positively and constricted pupils negatively. Noting that a dark iris — the colored portion surrounding the pupil — is hard to distinguish from the black of the pupil (and thereby affects the pupil''s apparent size) and that many domestic dogs have dark irises, Akitsugu Konno et al. showed close-up images of dogs'' faces to human participants and asked them to rate the dogs'' traits and their own attitudes toward the dogs. Their findings suggest that ______', NULL, 'Which choice most effectively uses data from the table to complete the statement?', '{"A":"humans'' responses to pupil size in other people may extend to dogs, as participants responded more positively to images of dogs whose iris colors were likely to make their pupils appear large than they did to images of dogs whose iris colors were unlikely to have that effect.","B":"iris color in domestic dogs may be an adaptation to elicit positive responses from humans, as participants responded negatively to images of dogs whose iris colors can make pupils appear large than they did to images of dogs without such iris colors.","C":"differences in dogs'' pupil size may elicit a stronger response in humans than differences in people''s pupil size do, as participants'' responses to the images when dogs'' pupils were actually large were indistinguishable from participants'' responses.","D":"humans may not be as sensitive to pupil size in dogs as they are to pupil size in other people, as participants'' responses to the images show no relationship to differences in the shade of dogs'' irises that could affect how large the dogs'' pupils appear to be."}'::jsonb, NULL, 'A', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '2-11', 11, 'mcq', 'Carolina chickadees are cavity nesting birds that initiate nest building at the same time of year as golden paper wasps, a species that also nests in enclosed spaces. Researchers observed that both species will settle in nesting boxes, but birds and wasps are not often observed co-occupying boxes, leading to the hypothesis that the two species compete for nesting sites. To test this hypothesis, the researchers installed nesting boxes throughout a nature preserve in the US state of North Carolina, manipulated some of the boxes to exclude birds, and then monitored the boxes for two years. Not only was the hypothesis validated, there was also a clear indication of competitive advantage for birds.', NULL, 'Which finding from the study, if true, would most directly support the text''s characterization of the study''s results?', '{"A":"Although only 15 instances of co-occupation of unmanipulated boxes by wasps and birds were observed over the course of the study, in a majority of those instances, wasps were already occupying the boxes when birds initiated nesting in them.","B":"Wasps initiated nesting in manipulated boxes much more often than in unmanipulated boxes, and 80% of initial co-occupations of unmanipulated boxes resulted in abandonment by wasps but not by birds.","C":"Even though overall usage of the nesting boxes by wasps and birds was high throughout the study, 24% of the manipulated boxes remained vacant each spring, while less than 4% of the unmanipulated nesting boxes remained vacant.","D":"Nest initiation by either birds or wasps but not both was observed in more than 90% of the unmanipulated boxes, but nest initiation by wasps was observed in less than 50% of the manipulated boxes."}'::jsonb, NULL, 'B', NULL, NULL, 40)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '2-12', 12, 'mcq', 'Based on findings from fossil sites, paleobotanists had developed the so-called partition hypothesis, which holds that there were two distinctly different kinds of biomes during the Devonian period (circ a 360 to 420 million years ago). One was a tropical deltaic forest biome home to plants such as the fernlike Eospermatopteris, and the other was an arid floodplain forest biome home to plants such as the coniferlike Archaeopteris. Recently, however, evolutionary ecologist Khudadad Khudadad examined the remnants of a Devonian forest in what is now Cairo, New York, and concluded that evidence from the Cairo site is inconsistent with the partition hypothesis.

Dospermatopteris

and Archaeopteris lived there', NULL, 'Which finding about the Cairo site, if true, would most directly support Khudadad''s conclusion?', '{"A":"The site appears to have been a tropical deltaic forest early in the Devonian period but transitioned to an arid floodplain forest after the end of the Devonian period.","B":"Fossil evidence from the site suggests that several forest plant species other than Dospermatopteris and Archaeopteris lived there the Devonian period.","C":"Although the site appears to have been a tropical deltaic forest during the Devonian period, fossil evidence suggests that Eospermatopteris was present at that time.","D":"The site appears to have been an arid floodplain forest during the Devonian period and contains fossil evidence of contemporaneous Dospermatopteris and Archaeopteris."}'::jsonb, NULL, 'D', NULL, NULL, 41)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '2-13', 13, 'mcq', 'Callie W. Babbitt, Hema Madaka, and colleagues assembled a database of materials used in consumer electronics by studying products in the lab and by gathering data from similar product studies. The team gave each of these studies a rating for level of detail (with a higher rating for reported data with more detail) and for level of traceability (with a higher rating for clearer descriptions of procedures). Based on these ratings, a second research team concluded that a study by Paul Teehan and Milind Kandlikar provided more specificity in its data than a study by Oguchi Masahiro and colleagues did.', NULL, 'Which finding, if true, would most directly challenge the second research team''s conclusion?', '{"A":"The study by Oguchi and colleagues had a low detail rating and a low traceability rating.","B":"The study by Teehan and Kandlikar had a lower traceability rating than the study by Oguchi and colleagues did.","C":"The study by Teehan and Kandlikar had a high detail rating and a high traceability rating.","D":"The study by Teehan and Kandlikar had a lower detail rating than the study by Oguchi and colleagues did."}'::jsonb, NULL, 'D', NULL, NULL, 42)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '2-14', 14, 'mcq', 'In 1990, oil prices rose 90% between August and October, creating what economists term an oil shock. Although oil shocks have occurred multiple times since 1945, a broadly applicable description of how oil shocks affect economies at the national level has proved elusive, a problem typically attributed to the fact that oil shocks'' effects are substantially conditioned on country-specific characteristics (oil import-export ratios, most importantly). Recently, however, Gbadebo Oladosu et al. showed that economists'' estimates of national economies'' responsiveness to oil shocks are highly heterogeneous even within a given country and time frame—ranging by more than a factor of five in the case of Australia during a recent oil shock, for instance — suggesting that ______', NULL, 'Which choice most logically completes the text?', '{"A":"differences in oil import-export ratios from one country to another may account for more of the differences in the effects of oil shocks on those countries'' economies than economists previously believed.","B":"methodological discrepancies in studies of oil shocks may have contributed to economists'' inability to provide a generalized model of oil shocks'' effects on national economies.","C":"economists'' conventional measures of national economic activity may be insufficiently sensitive to the effects of oil shocks.","D":"controlling for variations in countries'' oil import-export ratios may have obscured inconsistencies in economists'' findings about the effects of oil shocks at national levels."}'::jsonb, NULL, 'B', NULL, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '2-15', 15, 'mcq', 'Saeed M. Z. A. Tarabich conducted a study of consumer attitudes toward Jordanian food and beverage companies and found that for consumers who value environmental conservation, their likelihood of purchasing a product decreased when their perception of the product''s risk of causing environmental harm increased. Subsequently, other researchers conducted a study of various demographic groups in China, investigating participants'' intentions to purchase a new piece of furniture, and found that, on average, college students had the lowest perception among all the demographic groups in the study of the environmental risks of furniture. Assuming that the results of Tarabich''s study are broadly applicable, this finding suggests that ______', NULL, 'Which choice most logically completes the text?', '{"A":"the new piece of furniture is less appealing to college students than other similar products on the market are.","B":"college students might be more likely than participants in the other demographic groups to purchase the piece of furniture.","C":"college students likely prioritize other factors over a product''s environmental sustainability when making purchasing decisions.","D":"there is not a meaningful difference in the average likelihood of purchasing environmentally friendly products among the demographic groups included in the study."}'::jsonb, NULL, 'B', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '2-16', 16, 'mcq', 'The advent of online streaming has led many music listeners to drift away from ownership of music (through downloads or through physical media such as compact discs) and toward the streaming services Bandcamp and Tidal, among others. Datt et al. studied the impact of this change on the variety of music that listeners consume. The researchers reasoned that the ownership model of music assigns a cost per song to acquiring a variety of music, while streaming services typically charge a flat fee for access to an entire music catalog, making variety free, which suggests that ______', NULL, 'Which choice most logically completes the text?', '{"A":"listeners who use streaming services would be more likely to give physical copies of music as gifts to others than to purchase physical copies for themselves.","B":"listeners who prefer to purchase compact discs rather than use a service such as Bandcamp or Tidal would tend to listen to older music.","C":"the music choices of listeners who use streaming services would likely be more varied than those of listeners who do not use streaming services.","D":"music publishers who choose to forgo releasing music on physical media are likely to see no change in revenue."}'::jsonb, NULL, 'C', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '2-17', 17, 'mcq', 'In a letter dated January 14th, 1780, congressman John Witherspoon attempts to persuade General George Washington that the Continental Army''s difficulty in procuring supplies, often attributed to disloyalty among civilian farmers and merchants, ______ due to concerns suppliers have about receiving compensation in the form of rapidly depreciating Continental currency.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"largely occurring","B":"largely occur","C":"have largely occurred","D":"is largely occurring"}'::jsonb, NULL, 'D', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '2-18', 18, 'mcq', 'Social media platforms have made the collection of qualitative human behavioral data easier than ever. To collect such data by means of social media does raise a serious ethical ______ terms of service stipulate that platforms can analyze users'' accounts and posts, according to sociologist Jose van Dijck, users are not informed when their data are included in behavioral studies.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"concern, though;","B":"concern: though","C":"concern, though","D":"concern, though:"}'::jsonb, NULL, 'B', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '2-19', 19, 'mcq', 'The neurotechnology company MindMaze is working on an exciting new technology: game-based digital therapies that improve neuroplasticity to help with cognitive rehabilitation. MindMaze''s technology, alongside other such neuromodulation technologies that function by stimulating nervous system structures, ______ the way for future advancements in neurotechnology.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"are paving","B":"is paving","C":"have paved","D":"paving"}'::jsonb, NULL, 'B', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '2-20', 20, 'mcq', 'Helical ______ widely understood to confer stability and efficiency in the locomotion of a variety of microscopic organisms—including bacteria, eukaryotic algae, and ciliates—bestows similar advantages, albeit via different propulsive modes, to larger oceanic macroplanktons, such as salps.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"swimming is","B":"swimming has been","C":"swimming, is","D":"swimming,"}'::jsonb, NULL, 'D', NULL, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '2-21', 21, 'mcq', 'Alberto Gabriele, author of Reading Popular Culture in Victorian Print, tracks the transnational dissemination of works by author Mary Elizabeth Braddon via the magazine______from 1866 to 1899 and distributed throughout the Australian cities of Melbourne, Adelaide, and Hobart; the continental European cities of Brussels, Paris, and Turin; and cities in Turkey, India, and Jamaica, this magazine helped make Braddon''s serialized novels globally available.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"Belgravia, published","B":"Belgravia published","C":"Belgravia; published","D":"Belgravia. Published"}'::jsonb, NULL, 'D', NULL, NULL, 50)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '2-22', 22, 'mcq', 'Brothers Orville and Wilbur Wright famously received a patent for their flying machine on May 22, 1906. Louisiana native Charles F. Page, who was born into slavery and self-educated, created a gas-powered flying ship in 1903 that was officially patented on April 10, ______ only model had been suspiciously destroyed en route to a planned demonstration at the 1904 World''s Fair, and, discouraged, he never built a replacement.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"1906 — roughly six weeks earlier. Page''s","B":"1906. Roughly six weeks earlier, Page''s","C":"1906 roughly six weeks earlier, Page''s","D":"1906 — roughly six weeks earlier — Page''s"}'::jsonb, NULL, 'A', NULL, NULL, 51)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '2-23', 23, 'mcq', 'In contrast to first-past-the-post electoral processes, the proportional representation system by which Paraguay''s Chamber of Senators is elected begins with citizens casting their votes not for specific candidates but for political parties. ______ once the votes have been tabulated, each party is awarded a number of seats proportional to the number of votes it received.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Conversely,","B":"In other words,","C":"However,","D":"Then,"}'::jsonb, NULL, 'D', NULL, NULL, 52)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '2-24', 24, 'mcq', 'At Storm King Art Center, an outdoor sculpture park in New York, Herbert Ferber''s Konkapot II is exposed to rain, snow, heat, and humidity. ______ it remains in good condition due to its material: Ferber''s sculpture is made of corrosion-resistant steel.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"As a result,","B":"On the contrary,","C":"That said,","D":"In addition,"}'::jsonb, NULL, 'C', NULL, NULL, 53)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '2-25', 25, 'mcq', 'Photogrammetry and boolean modeling approaches to three-dimensional digital modeling for video games yield graphics that accurately represent the relative sizes and proportions of real-world objects, but since these graphics are rendered from perfect geometric shapes, they tend to lack organic realism. ______ these 3D elements may display unnaturally precise angles and curves as compared to their real-world counterparts.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"In conclusion,","B":"As such,","C":"However,","D":"In addition,"}'::jsonb, NULL, 'B', NULL, NULL, 54)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '2-26', 26, 'mcq', 'While researching a topic, a student has taken the following notes:
• Raymond is the nickname of a Triceratops fossil specimen housed at the National Museum of Nature and Science.
• The National Museum of Nature and Science is located in Tokyo, Japan.
• Raymond lived in the Late Cretaceous period.
• Dio is the nickname of a Triceratops fossil specimen housed at the Royal Ontario Museum.
• The Royal Ontario Museum is located in Ontario, Canada.
• Dio lived in the Late Cretaceous period.', NULL, 'The student wants to contrast the locations of the two specimens. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Raymond is housed at the National Museum of Nature and Science in Tokyo, Japan, while Dio is housed at the Royal Ontario Museum in Ontario, Canada.","B":"Like Raymond, Dio is a Triceratops fossil specimen that lived in the Late Cretaceous period.","C":"The Royal Ontario Museum in Ontario, Canada, houses Dio, a Triceratops fossil specimen.","D":"The Triceratops fossil specimen Raymond is not the only such specimen currently housed in a museum or institute."}'::jsonb, NULL, 'A', NULL, NULL, 55)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '2-27', 27, 'mcq', 'While researching a topic, a student has taken the following notes:
• Manchu is a synthetic language in the Tungusic language family.
• In synthetic languages, nouns can take several different forms (or cases) depending on their function within a sentence.
• Combining the suffix de with the Manchu noun boo (house) forms the locative-case noun boode (in the house).
• Synthetic languages have extensive case systems. In analytic languages, cases are not typically used to indicate noun function.
• Noun function is instead indicated through word order and auxiliary words (such as prepositions and adjectives).', NULL, 'The student wants to explain why Manchu is classified as a synthetic language. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Manchu is classified as a synthetic language, meaning that the Tungusic language utilizes nouns to fulfill various functions within a sentence.","B":"Manchu is a synthetic language rather than an analytic language, where nouns rely on word order and auxiliary words to indicate their function.","C":"Manchu has a robust case system in which nouns take different forms depending on their function, making it a synthetic language.","D":"In contrast to an analytic language, a synthetic language like Manchu indicates a noun''s function within a sentence."}'::jsonb, NULL, 'C', NULL, NULL, 56)
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
        time_limit_seconds = EXCLUDED.time_limit_seconds, question_count = EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '3-1', 1, 'mcq', 'graph: two lines intersecting at a point on the coordinate plane; x-axis from -6 to 6, y-axis from -6 to 6; one line rises steeply through the intersection point, the other also rises through the same point; lines appear to cross at (5,3)', NULL, 'The graph of a system of linear equations is shown. What is the solution (x, y) to the system?', '{"A":"(5, 3)","B":"(4, 3)","C":"(3, 3)","D":"(0, 3)"}'::jsonb, NULL, 'A', NULL, NULL, 3)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '3-2', 2, 'mcq', NULL, NULL, 'The area of a rectangle is 70 square inches. The length of the longest side of the rectangle is 14 inches. What is the length, in inches, of the shortest side of this rectangle?', '{"A":"5","B":"14","C":"28","D":"56"}'::jsonb, NULL, 'A', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '3-3', 3, 'mcq', 'table:
Classification | Frequency
igneous | 10
metamorphic | 36
sedimentary | 24', NULL, 'Each rock in a collection of 70 rocks was classified as either igneous, metamorphic, or sedimentary, as shown in the frequency table. If one of these rocks is selected at random, what is the probability of selecting a rock that is igneous?', '{"A":"10/24","B":"10/36","C":"10/60","D":"10/70"}'::jsonb, NULL, 'D', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '3-4', 4, 'grid', 'table:
Air temperature | Wind chill temperature at wind speed 20 mph | Wind chill temperature at wind speed 60 mph
27°F | 13°F | 6°F
30°F | 17°F | 10°F
33°F | 21°F | 15°F', NULL, 'For certain air temperatures, the table gives wind chill temperatures for two different wind speeds. According to the table, what is the wind chill temperature, in degrees Fahrenheit (°F), when the air temperature is 27°F and the wind speed is 20 miles per hour(mph)? (Disregard the degree symbol when entering your answer.)', NULL, NULL, '13', '["13"]'::jsonb, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '3-5', 5, 'mcq', 'j/5 = k + 9m', NULL, 'The given equation relates the distinct positive numbers j, k, and m. Which equation correctly expresses j in terms of k and m?', '{"A":"j = k + 5(9m)","B":"j = 5(k + 9m)","C":"j = 5k + 9m","D":"j = (k + 9m)/5"}'::jsonb, NULL, 'B', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '3-6', 6, 'mcq', NULL, NULL, 'The function h is defined by h(x) = 5|x|. What is the value of h(-4)?', '{"A":"-20","B":"1","C":"9","D":"20"}'::jsonb, NULL, 'D', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '3-7', 7, 'grid', NULL, NULL, 'A student council group is selling car stickers for a fundraiser. They use the function p(x) = 5x - 210 to determine their profit p(x), in dollars, for selling x car stickers. In order to earn a profit of $800, how many car stickers must they sell?', NULL, NULL, '202', '["202"]'::jsonb, NULL, 9)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '3-8', 8, 'mcq', NULL, NULL, 'For two acute angles X and Y, the measure of angle Y is 32° and (sinX)/(cosY) = 1. What is the measure, in degrees, of angle X?', '{"A":"77","B":"58","C":"45","D":"32"}'::jsonb, NULL, 'B', NULL, NULL, 10)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '3-9', 9, 'grid', NULL, NULL, 'Charles saves 4/5 of the $230 he earns each week from his summer job. If Charles continues to save at this rate, how much money, in dollars, will Charles save in 3 weeks?', NULL, NULL, '552', '["552"]'::jsonb, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '3-10', 10, 'mcq', NULL, NULL, 'If x/y = 64 and cx/(4y) = 64, what is the value of c?', '{"A":"4","B":"16","C":"64","D":"256"}'::jsonb, NULL, 'A', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '3-11', 11, 'mcq', 'Coordinate plane graph showing line k passing through the origin with a positive slope (approximately 5/4), extending from lower-left to upper-right across a grid from -10 to 10 on both axes.', NULL, 'Line k is shown in the xy-plane. Line n (not shown) is perpendicular to line k and passes through the point (4, 7). Which equation defines line n?', '{"A":"y = -(5/4)x + 2","B":"y = -(5/4)x + 12","C":"y = (5/4)x + 2","D":"y = (5/4)x + 12"}'::jsonb, NULL, 'B', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '3-12', 12, 'mcq', NULL, NULL, 'If 7(6 - 9x) + 4 = 6(6 - 9x) + 19, what is the value of 6 - 9x?', '{"A":"-15","B":"-1","C":"1","D":"15"}'::jsonb, NULL, 'D', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '3-13', 13, 'mcq', NULL, NULL, 'Trapezoid CDEF is similar to trapezoid JKLM, such that C, D, E, and F correspond to J, K, L, and M, respectively. The length of each side of trapezoid JKLM is 4 times the length of its corresponding side in trapezoid CDEF. The measure of angle C is 42°. What is the measure of angle J?', '{"A":"38°","B":"42°","C":"46°","D":"168°"}'::jsonb, NULL, 'B', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '3-14', 14, 'mcq', 'Table with two columns: Distance (miles) and Average time (minutes).
Rows: 0.18 | 9; 0.24 | 12; 0.36 | 18', NULL, 'The table gives the average time t, in minutes, it takes Adriana to travel a certain distance d, in miles. Which equation could represent this linear relationship?', '{"A":"t = 50d","B":"t = (1/2)d","C":"t = 2d","D":"t = (1/50)d"}'::jsonb, NULL, 'A', NULL, NULL, 16)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '3-15', 15, 'mcq', 'Right triangle ABC with the right angle at B. Vertex A is at top-left, B at bottom-left, C at bottom-right. The hypotenuse AC has length 90. Note: Figure not drawn to scale.', NULL, 'In right triangle ABC, the tangent of angle C is 3/4. What is the length of AB?', '{"A":"35/16","B":"15/4","C":"54","D":"72"}'::jsonb, NULL, 'C', NULL, NULL, 17)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '3-16', 16, 'mcq', 'f(x) = x^2 - 12x + 30', NULL, 'What is the minimum value of the given function?', '{"A":"-12","B":"-6","C":"6","D":"30"}'::jsonb, NULL, 'B', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '3-17', 17, 'grid', NULL, NULL, 'In the ancient Roman measurement system, a leuga was a unit of length that was equal to 7,500 pedes. In this measurement system, how many pedes were equivalent to 3.8 leugas?', NULL, NULL, '28500', '["28500"]'::jsonb, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '3-18', 18, 'grid', 'Table showing values of linear function f:
x | f(x)
-8 | 48
8 | -96
24 | -240', NULL, 'For the linear function f, the table shows three values of x and their corresponding values of f(x). Function f is defined by f(x) = rx + s, where r and s are constants. What is the value of rs?', NULL, NULL, '216', '["216"]'::jsonb, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '3-19', 19, 'mcq', 'x(x + 9) - 13 = 0', NULL, 'What are the solutions to the given equation?', '{"A":"x = (9 +/- sqrt(29))/2","B":"x = (9 +/- sqrt(133))/2","C":"x = (-9 +/- sqrt(29))/2","D":"x = (-9 +/- sqrt(133))/2"}'::jsonb, NULL, 'D', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '3-20', 20, 'grid', NULL, NULL, '2|5x - 5| = 11

What is the sum of the solutions to the given equation?', NULL, NULL, '2', '["2"]'::jsonb, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '3-21', 21, 'mcq', NULL, NULL, 'The positive number a is 290% of the number b, and a is 90% of the number c. If c is p% of b, which of the following is closest to the value of p?', '{"A":"211","B":"222","C":"261","D":"322"}'::jsonb, NULL, 'D', NULL, NULL, 23)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '3-22', 22, 'mcq', NULL, NULL, 'A computer program models the total mass of the population of a certain type of algae after the algae was placed in an environment where it has no natural predators. According to the model, the estimated total mass of this population of algae at the end of every 6-hour period is 129% greater than the estimated total mass of this population of algae at the end of the previous 6-hour period, and the estimated total mass of this population of algae is 613.90 grams after 18 hours. Which equation best represents this model, where A is the estimated total mass, in grams, of the population of algae after x hours, and x <= 18?', '{"A":"A = 34.11(1.29)^(x/6)","B":"A = 34.11(2.29)^(x/6)","C":"A = 51.12(2.29)^(x/6)","D":"A = 245.98(1.29)^(x/6)"}'::jsonb, NULL, 'C', NULL, NULL, 24)
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
        time_limit_seconds = EXCLUDED.time_limit_seconds, question_count = EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '4-1', 1, 'mcq', NULL, NULL, '5y = 6x + 17

-5y = 7x - 23

The solution to the given system of equations is (x, y). What is the value of 39x?', '{"A":"-18","B":"-6","C":"6","D":"18"}'::jsonb, NULL, 'D', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '4-2', 2, 'mcq', 'Graph in the xy-plane showing a shaded region. A line passes through approximately (0, 3) and (1, 7), suggesting slope 4 and y-intercept 3. The shaded region is to the left of and above the line (the region where x is negative and y is large), bounded by the line.', NULL, 'The shaded region shown represents the solutions to which inequality?', '{"A":"y > 4x + 3","B":"y > 4x - 3","C":"y < 4x + 3","D":"y < 4x - 3"}'::jsonb, NULL, 'A', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '4-3', 3, 'mcq', NULL, NULL, 'A circle in the xy-plane has its center at (-5, 2) and the point (-9, 5) lies on the circle. Which equation represents this circle?', '{"A":"(x - 5)^2 + (y + 2)^2 = 5","B":"(x + 5)^2 + (y - 2)^2 = 5","C":"(x - 5)^2 + (y + 2)^2 = 25","D":"(x + 5)^2 + (y - 2)^2 = 25"}'::jsonb, NULL, 'D', NULL, NULL, 29)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '4-4', 4, 'mcq', NULL, NULL, 'y < -3x + 18

Which point (x, y) is a solution to the given inequality in the xy-plane?', '{"A":"(0, 19)","B":"(-1, 22)","C":"(-3, 0)","D":"(7, -1)"}'::jsonb, NULL, 'C', NULL, NULL, 30)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '4-5', 5, 'mcq', NULL, NULL, '18(x + 5) = 2(x + c) + 16x

In the given equation, c is a constant. The equation has infinitely many solutions. What is the value of c?', '{"A":"90","B":"45","C":"10","D":"5"}'::jsonb, NULL, 'B', NULL, NULL, 31)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '4-6', 6, 'grid', 'Table with columns x and y:
x = -5/9, y = 0
x = 0, y = -120
x = 6, y = 0', NULL, 'The table shows three values of x and their corresponding values of y. There is a quadratic relationship between x and y. An equation that represents this relationship can be written as y = 36x^2 - bx - 120, where b is a constant. What is the value of b?', NULL, NULL, '196', '["196"]'::jsonb, NULL, 32)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '4-7', 7, 'mcq', NULL, NULL, 'Hannah and Wyatt are saving money to purchase a car. Hannah saves 1/5 of her salary each month, and Wyatt saves 2/7 of his salary each month. Together, they save a total of $3,270 from their monthly salaries each month. If h and w represent Hannah''s and Wyatt''s monthly salaries, in dollars, respectively, which equation shows the relationship between h and w?', '{"A":"h + w = 3,270","B":"h + 2w = 3,270","C":"10h + 7w = 114,450","D":"7h + 10w = 114,450"}'::jsonb, NULL, 'D', NULL, NULL, 33)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '4-8', 8, 'mcq', NULL, NULL, 'The function h is defined by h(x) = (x + p)(x - 4)(2x - 12), where p is a constant. In the xy-plane, the graph of y = h(x) passes through the point (-2, 0). What is the value of h(0)?', '{"A":"-48","B":"-2","C":"8","D":"96"}'::jsonb, NULL, 'D', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '4-9', 9, 'mcq', 'x - a = (x - a)(x - 24)', NULL, 'Which of the following are solutions to the given equation, where a is a constant and a > 25?
I. a
II. 24
III. 25', '{"A":"I and II only","B":"I and III only","C":"II and III only","D":"I, II, and III"}'::jsonb, NULL, 'B', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '4-10', 10, 'mcq', NULL, NULL, 'If sqrt(x - 1) = 2, what is the value of (x - 1)?', '{"A":"2","B":"3","C":"4","D":"8"}'::jsonb, NULL, 'C', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '4-11', 11, 'mcq', 'Figure showing a rectangular pool surrounded by a concrete path. The concrete path is x ft wide on all sides. The pool is labeled inside a larger rectangle; the path width x ft is marked on the top and left sides. Note: Figure not drawn to scale.', NULL, 'The figure shows a rectangular pool surrounded by a concrete path that is x feet (ft) wide on all sides. The pool is 21 ft long and 11 ft wide. The area of the concrete path is 144 ft^2. What is the value of x?', '{"A":"2","B":"4","C":"18","D":"36"}'::jsonb, NULL, 'A', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '4-12', 12, 'mcq', 'Table summarizing data set A — Number of bald eagles observed at a nature preserve for 21 days:
Number of bald eagles | Number of days
0 | 1
1 | 3
2 | 4
3 | 5
4 | 4
5 | 3
19 | 1', NULL, 'At a nature preserve, a wildlife biologist counted bald eagles from an observation deck at the same time each day for 21 days. The table summarizes the resulting data set, data set A. The data value 19 was recorded in error and is removed from data set A to create data set B, which consists of the remaining 20 data values. Which statement best compares the median of data set A and the median of data set B?', '{"A":"The median of data set B is less than the median of data set A.","B":"The median of data set B is equal to the median of data set A.","C":"The median of data set B is greater than the median of data set A.","D":"There is not enough information to compare the medians of the two data sets."}'::jsonb, NULL, 'B', NULL, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '4-13', 13, 'mcq', NULL, NULL, 'One gallon of paint will cover 70 square feet of a surface. A room has a total wall area of w square feet. Which equation represents the total amount of paint P, in gallons, needed to paint the walls of the room twice?', '{"A":"P = w/70","B":"P = 70w","C":"P = 140w","D":"P = w/35"}'::jsonb, NULL, 'D', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '4-14', 14, 'mcq', 'f(x) = 4^(-5(x+1))', NULL, 'Which of the following equivalent forms of the given function f displays, as the base or the coefficient, the y-coordinate of the y-intercept of the graph of y = f(x) in the xy-plane?', '{"A":"f(x) = (1/1,024)(1/4)^(5x)","B":"f(x) = (1/4)^(5x+5)","C":"f(x) = 4^(-5x-5)","D":"f(x) = (1,024)^(-x-1)"}'::jsonb, NULL, 'A', NULL, NULL, 40)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '4-15', 15, 'grid', '(117n)^(1/3) * ((117n)^(1/4))^2', NULL, 'For what value of x is the given expression equivalent to (117n)^(12x), where n > 1?', NULL, NULL, '5/72', '["5/72"]'::jsonb, NULL, 41)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '4-16', 16, 'grid', 'Table with two rows: Right circular cylinder A has volume 392*pi cubic units; Right circular cylinder B has volume 10,584*pi cubic units.', NULL, 'The table shows the volume of two similar solids, right circular cylinder A and right circular cylinder B. The radius of right circular cylinder A is 7 units. The surface area of right circular cylinder A is k*pi square units, and the surface area of right circular cylinder B is n*pi square units, where k and n are constants. What is the value of n - k? (The surface area of a right circular cylinder with radius r and height h is 2*pi*r^2 + 2*pi*r*h.)', NULL, NULL, '1680', '["1680"]'::jsonb, NULL, 42)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '4-17', 17, 'grid', NULL, NULL, 'In triangle RST, angle T is a right angle, point L lies on RS, point K lies on ST, and LK is parallel to RT. If the length of RT is 63 units, the length of LK is 21 units, and the area of triangle RST is 252 square units, what is the length of KT, in units?', NULL, NULL, '16/3', '["16/3"]'::jsonb, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '4-18', 18, 'grid', NULL, NULL, 'A researcher investigated two species of mites: a predator and its prey. At the start of a week, there was an equal number of the two species. At the end of the week, the number of prey had increased by 1,900% of the number of prey at the start of the week, and the number of predators had increased by 150% of the number of predators at the start of the week. The number of prey at the end of the week was p% greater than the number of predators at the end of the week. What is the value of p?', NULL, NULL, '700', '["700"]'::jsonb, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '4-19', 19, 'mcq', 'y = 13x + 2
y = 13x^2 + 2', NULL, 'Which ordered pair (x, y) is a solution to the given system of equations?', '{"A":"(0, 0)","B":"(0, 2)","C":"(4, 54)","D":"(4, 106)"}'::jsonb, NULL, 'B', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '4-20', 20, 'mcq', NULL, NULL, 'What is an x-intercept of the graph of y = x^2 - 25 in the xy-plane?', '{"A":"(-25, 0)","B":"(-10, 0)","C":"(-5, 0)","D":"(-1, 0)"}'::jsonb, NULL, 'C', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '4-21', 21, 'mcq', NULL, NULL, 'For the linear function f, f(0) = 0 and f(42) = 6. Which equation defines f?', '{"A":"f(x) = x/7","B":"f(x) = x/6","C":"f(x) = x + 7","D":"f(x) = x + 6"}'::jsonb, NULL, 'A', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '4-22', 22, 'mcq', 'Figure showing three parallel vertical lines labeled n, s (left to right) intersected by a transversal line t. Angle x° is formed at the intersection of t with line n, and angle y° is formed at the intersection of t with line s. Note: Figure not drawn to scale.', NULL, 'In the figure, line n is parallel to line s, and both lines are intersected by line t. If x = 6z - 87 and y = 3z + 15, what is the value of z?', '{"A":"18","B":"28","C":"34","D":"81"}'::jsonb, NULL, 'C', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
END $seed$;
