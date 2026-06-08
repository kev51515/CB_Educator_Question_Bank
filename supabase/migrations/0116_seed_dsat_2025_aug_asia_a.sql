-- =============================================================================
-- Migration: 0116_seed_dsat_2025_aug_asia_a.sql
-- Purpose:   Seed "Test #3 — Digital SAT, August 2025 (Asia-Pacific, Form A)"
--            into the full-test tables from 0048.
--
--   Source:  2025-08-asia-a-rw.pdf (Two Engineers Prep, Bluebook-format reconstruction).
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
  VALUES ('dsat-2025-aug-asia-a', 3, 'Test #3 — Digital SAT, August 2025 (Asia-Pacific, Form A)', 'DSAT Aug 2025 Asia A', '2025-08-asia-a-rw.pdf', 54)
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
  VALUES (v_mod, 1, '1-1', 1, 'mcq', 'Traditionally, certain features of mosque architecture are nearly ______, such as the mihrab (or niche), which almost all mosques include. But mosques can also be built to reflect a multitude of different architectural styles, as in the case of the Great Mosque of Central Java, which includes elements from the Javanese and Greek revival styles.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"universal","B":"elaborate","C":"illusory","D":"idealized"}'::jsonb, NULL, 'A', NULL, NULL, 2)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '1-2', 2, 'mcq', 'The dates that archaeologists assign to most of the colossal sculptures of human heads produced by the Olmec civilization of Mesoamerica are necessarily ______. The majority of the sculptures have been moved from their original context, making precise dating impossible.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"uncontroversial","B":"irrelevant","C":"applicable","D":"approximate"}'::jsonb, NULL, 'D', NULL, NULL, 3)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '1-3', 3, 'mcq', '______ traditional descriptions of pollination syndromes (suites of floral traits, such as nectar composition and symmetry, hypothesized to have independently evolved as a result of selection pressure exerted by pollinators) and recent empirical observations of floral-trait combinations have led some ecologists to express reservations about the utility of those descriptions.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"Discrepancies between","B":"Proclamations of","C":"Recurrences of","D":"Affinities between"}'::jsonb, NULL, 'A', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '1-4', 4, 'mcq', 'Scientists discovered a 350-million-year-old fossilized forest of Calamophyton trees in modern-day England. The scientists believe the emergence of these Calamophyton trees changed the land significantly. For example, the tree roots would have greatly reduced soil erosion, and the accumulated twigs the trees shed likely created new habitats for animal life.', NULL, 'Which choice best describes the function of the underlined sentence in the text as a whole?', '{"A":"It suggests that there are likely fossilized Calamophyton forests from before 390 million years ago.","B":"It provides an example of when the Calamophyton forest likely merged.","C":"It illustrates how Calamophyton forests likely changed conditions on the land.","D":"It indicates how fast the Calamophyton forest spread."}'::jsonb, NULL, 'C', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '1-5', 5, 'mcq', 'The following text is from Louise Erdrich''s 1986 novel The Beet Queen. The narrator discusses her relationship with her young niece, Dot, Celestine, the narrator''s sister-in-law, is Dot''s mother.

Dot and I had a mental connection, I was sure of it. I understood things about the baby that her mother could not accept.
For instance, she was never meant to be a baby. Dot was as impatient with babyhood as I. She tried at once to grow out of it.
Celestine never saw that, because she, and only she, took pleasure in Dot''s helpless softness. Only Celestine was saddened by her daughter''s fierce progress. Day by day, Dot grew stronger. In her shopping-cart stroller she exercised to exhaustion, bouncing for hours to develop her leg muscles.
1986 by Louise Erdrich', NULL, 'Which choice best describes the main purpose of the text?', '{"A":"To present the narrator''s belief that she understands Dot better than Celestine does","B":"To speculate that when Dot is older, her personality will be like Celestine''s","C":"To discuss what the narrator and Celestine do to amuse Dot","D":"To compare the narrator''s physical appearance to the physical appearance of Celestine"}'::jsonb, NULL, 'A', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '1-6', 6, 'mcq', 'Adelaide is one of many cities that have installed pontoons or other hardening structures to protect their shorelines against coastal hazards. To assess how birds respond to shoreline hardening and other landscape alterations, Diann Prosser et al. used a tool known as the Index of Waterbird Community Integrity to survey bird communities consisting of sixty-four species, including the tundra swan and the great blue heron, in the Chesapeake Bay on the US East Coast. The researchers concluded that shoreline hardening more negatively affects birds than does land development for uses such as housing.', NULL, 'Which choice best describes the overall structure of the text?', '{"A":"It introduces a certain technique, mentions the hypothesis of a study into an ecological consequence of that technique, and presents evidence in support of that study''s hypothesis.","B":"It provides an example of a location that has adopted a particular approach, explains the methodology of a study into an ecological effect of that approach, and describes a finding of that study.","C":"It makes a claim about the use of a specific strategy, describes field observations of a consequence of that strategy in a particular ecosystem, and makes a supposition based on those observations.","D":"It presents a solution to a commonly occurring problem, summarizes the procedures used by a group of researchers studying the environmental impact of that solution, and notes the significance of the researchers'' findings."}'::jsonb, NULL, 'B', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '1-7', 7, 'mcq', 'Women like Dorothy T. Blum made important early contributions to the history of US cryptology, a field concerned with secure data communication and storage. Blum provided cryptological services for the US Army in the 1940s and then joined the National Security Agency (NSA). She was a pioneer in transitioning the NSA to using computers for cryptoanalysis. In doing so, Blum and others like her helped make it possible for more women—such as Maureen Baginski, who currently works in intelligence and supports the FBI—to enter the field of cryptology.', NULL, 'Which choice best states the main idea of the text?', '{"A":"Cryptology is a field that focuses primarily on securely managing data.","B":"Women such as Dorothy T. Blum and Maureen Baginski have contributed to the field of cryptology.","C":"Dorothy T. Blum and Maureen Baginski worked together on an important project in the field of cryptology.","D":"Cryptology should be taught more often in schools to encourage more women to enter the field."}'::jsonb, NULL, 'B', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '1-8', 8, 'mcq', 'Researchers who examined data from radio-tagged southern sea otters (Enhydra lutris nereis) identified fitness benefits gained by otters that used tools. By using fixed stones as anvils, tool-using otters gained access to high-quality, hard-shelled prey (e.g., mussels and clams) that they could usually not access through biting alone. Non-tool-using otters foraged abundant, energy-poor, easily extractable prey instead (e.g., snails). Even when easily processed prey were depleted, tool-using otters that processed mussels and clams were thus able to obtain their needed energy resources and to do so without incurring tooth damage.', NULL, 'What does the text most strongly suggest about southern sea otters in environments where snails, mussels, and clams are present?', '{"A":"Those otters whose diet consists mainly of snails will likely exhibit less tooth damage than will those otters that use tools to consume mussels and clams.","B":"Those otters that do not use tools will likely have more robust health than those otters that do use tools.","C":"Those otters that do not use tools will likely need to process larger amounts of prey to meet their energy requirements than will those otters that use tools.","D":"Those otters that consume mussels and clams without the use of tools will likely spend less time foraging than will those otters that use tools to access the same prey resources."}'::jsonb, NULL, 'C', NULL, NULL, 9)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '1-9', 9, 'mcq', 'Over the course of the 1900s, more and more Native Hawaiians spoke English instead of the Hawaiian language. To preserve their language, Native Hawaiian teachers founded the ʻAha Pūnana Leo preschool in 1984. They spoke Hawaiian while teaching, and their Native Hawaiian students were soon able to understand and speak it themselves. The school was a huge success. Eventually it opened locations around Hawaiʻi and started teaching Hawaiian to elementary and high school students too. Thanks to ʻAha Pūnana Leo, the number of young people who speak the language has increased.', NULL, 'Which statement, if true, would most directly support the underlined claim?', '{"A":"Besides Native Hawaiians, tens of thousands of people from other Pacific Islander communities live in Hawaiʻi today, including over 37,000 Samoans.","B":"Fewer than fifty children could speak Hawaiian when ʻAha Pūnana Leo opened, but now more than 2,000 students at ʻAha Pūnana Leo speak it.","C":"Hawaiian is very similar to other languages that are spoken on the Polynesian islands of the Pacific Ocean, including Tahitian, Samoan, and Māori.","D":"Roughly 680,000 Native Hawaiian people lived in the United States in 2020, and a little less than half of them lived in Hawaiʻi."}'::jsonb, NULL, 'B', NULL, NULL, 10)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '1-10', 10, 'mcq', 'Cumulative Counts of Fish in Three Taiwanese Tide Pools, 1999-2018
Species | Station 1 | Station 2 | Station 3
barred flagtail | 249 | 64 | 16
streaky rockskipper | 125 | 139 | 610
blackspotted rockskipper | 83 | 74 | 31
Cocos frillgoby | 50 | 64 | 90
Lin-Tai Ho and colleagues tracked fish populations in three tide pool-monitoring stations in Taiwan from 1999 to 2018. Although a total of only 31 blackspotted rockskippers were observed at station 3, that was not the lowest count at any station: ______', NULL, 'Which choice most effectively uses data from the table to complete the assertion?', '{"A":"there were 16 streaky rockskippers observed at station 1.","B":"there were 610 streaky rockskippers observed at station 3.","C":"there were 16 barred flagtails observed at station 3.","D":"there were 50 Cocos frillgobies observed at station 1."}'::jsonb, NULL, 'C', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '1-11', 11, 'mcq', 'Numbers of the 23 Non-native Tree Species Reported and the Insect and Fungus Threats to Them
Country | Trees | Fungi | Insects
Austria | 13 | 51 | 50
Belgium | 4 | 13 | 11
Bulgaria | 9 | 14 | 16
Elisabeth Rötzelsberger and colleagues gathered data on 23 non-native tree species grown in Europe. They analyzed reports from Austria, Bulgaria, and Belgium about the number of insect and fungus species that damage those trees. The researchers concluded that Austria had a greater number of damaging fungus species than either of the other countries did.', NULL, 'Which choice best describes data from the table that support Rötzelsberger and colleagues'' conclusion?', '{"A":"Belgium reported 13 damaging fungus species but only 11 damaging insect species.","B":"Austria reported 51 damaging fungus species, whereas Bulgaria reported 16 damaging insect species.","C":"Bulgaria and Belgium reported 9 and 4 damaging fungus species, respectively, which is far fewer than Austria reported.","D":"Austria reported 51 damaging fungus species, which is more than either Bulgaria or Belgium reported."}'::jsonb, NULL, 'D', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '1-12', 12, 'mcq', 'The Wonderful Wizard of Oz is a 1900 novel by L. Frank Baum. In the novel, Dorothy lives in Kansas with her aunt and uncle, but she later finds herself in a land called Oz. The narrator indicates that her aunt and uncle''s house in Kansas is remote and solitary, writing that ______', NULL, 'Which quotation from The Wonderful Wizard of Oz most effectively illustrates the claim?', '{"A":"in Oz, \"[Dorothy and her companions] passed through the rest of the forest in safety, and when they came out from its gloom saw before them a steep hill, covered from top to bottom with great pieces of rock.\"","B":"in Oz, \"Dorothy fell asleep only once, and then she dreamed she was in Kansas, where Aunt Em was telling her how glad she was to have her little girl at home again.\"","C":"in Kansas, \"Dorothy lived in the midst of the great Kansas prairies, with Uncle Henry, who was a farmer, and Aunt Em, who was the farmer''s wife.\"","D":"in Kansas, \"When Dorothy stood in the doorway and looked around, she could see nothing but the great gray prairie on every side. Not a tree nor a house broke the broad sweep of flat country.\""}'::jsonb, NULL, 'D', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '1-13', 13, 'mcq', 'Carcinization, or the evolution of a crablike body form, has taken place in crustaceans many times over the last 250 million years. Decarcinization has occurred several times as well, even though it involves the loss of traits such as sideways walking that seem to have helped carcinized groups persist in a variety of ecosystems. In a 2021 paper, Joanna Wolfe and team note that many decarcinized groups are extinct and have very few living relatives—signs that decarcinization might be an "evolutionary dead-end." But the team also discusses how a single decarcinized group with traits suited to dwelling in sediment; fossils show that the group had decarcinized members as far back as the Early Cretaceous. This example suggests that ______', NULL, 'Which choice most logically completes the text?', '{"A":"the evolutionary benefits of a crablike body form are less certain than many studies of carcinization had previously implied.","B":"despite having many living relatives, some decarcinized groups did not benefit from decarcinization.","C":"sideways walking may have been less important to the survival of frog crabs than a protected abdomen and other traits associated with carcinization.","D":"a crablike body form may not be optimal in all cases, with ecological conditions sometimes favoring the persistence of decarcinization."}'::jsonb, NULL, 'D', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '1-14', 14, 'mcq', 'A group of primate conservationists recently began a long-term study of the effects of different conservation strategies on the northern muriqui (Brachyteles hypoxanthus). The species population is currently estimated to be around 1,000. It is challenging to accurately count these primates, however, which makes it difficult to tell whether the population is increasing, decreasing, or staying stable. The study may thus ______', NULL, 'Which choice most logically completes the text?', '{"A":"cause other conservationists to adopt a new methodology for counting populations.","B":"risk making inaccurate conclusions about the effectiveness of different conservation strategies.","C":"benefit from including species beyond the northern muriqui.","D":"fail to consider less-well-known conservation approaches for the northern muriqui."}'::jsonb, NULL, 'B', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '1-15', 15, 'mcq', 'Mountain goats were made to climb. In addition to having hard hooves that can dig into nearly any groove or ______ mountain goats have slender bodies ideal for scaling nearly ninety-degree cliffs.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"crack, or","B":"crack or","C":"crack","D":"crack,"}'::jsonb, NULL, 'D', NULL, NULL, 16)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '1-16', 16, 'mcq', 'As an object-oriented computer programming language, Perl is used by coders like Black Girls Code founder Kimberly Bryant to create computer programs by manipulating "objects" (that is, specifically defined variables or combinations of variables) into interacting with each other. Conversely, languages like Scheme, used in software development, ______ object oriented.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"is not","B":"are not","C":"was not","D":"has not been"}'::jsonb, NULL, 'B', NULL, NULL, 17)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '1-17', 17, 'mcq', 'In premodern Europe, one could sail from the east coast of England to the Netherlands or France faster than one could travel by land to England''s capital, London. In that era, historian Michael Pye argues in his 2015 book The Edge of the World: A Cultural History of the North Sea and the Transformation of Europe, the North Sea did more to link the various peoples, cultures, and economies on ______ shores than to divide them.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"it''s","B":"its","C":"their","D":"they''re"}'::jsonb, NULL, 'B', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '1-18', 18, 'mcq', 'Creating personas — brief profiles of imaginary characters that represent key segments of a customer base — can help user experience (UX) designers think like and empathize with those using their products. Fictional yet realistic, ______', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"these personas include specific details (demographics, browsing habits, etc.) that UX designers draw from actual users.","B":"specific details (demographics, browsing habits, etc.) are included in these personas.","C":"UX designers include specific details (demographics, browsing habits, etc.) drawn from actual users in these personas.","D":"actual users are the source of the specific details (demographics, browsing habits, etc.) that UX designers include in these personas."}'::jsonb, NULL, 'A', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '1-19', 19, 'mcq', 'As the exoplanet 17 Scorpii b orbits a star 408 light-years from Earth, the gas giant''s gravity causes the star to wobble. In 2020, astronomers observing the wobble — indicated by redshifts and blueshifts in the star''s spectral wavelengths — eventually attributed ______ to the gravitational influence of the previously undetected exoplanet.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"each","B":"these","C":"it","D":"them"}'::jsonb, NULL, 'C', NULL, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '1-20', 20, 'mcq', 'Although the term "balloonomania" — referring to the hot-air balloon fad in England and France in the late 1700s — might suggest that the public as a whole was captivated by the technology, it was not universally ______ whereas many flocked to balloon launches and purchased balloon-themed items ranging from dinnerware to accessories, others dismissed the hot-air balloon as an impractical and dangerous extravagance.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"embraced:","B":"embraced","C":"embraced,","D":"embraced and"}'::jsonb, NULL, 'A', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '1-21', 21, 'mcq', 'In February 1864, James Johnson joined the US Army. He went on to serve in the 18th New York Cavalry during the US Civil War and, ______ earned a place in US history as one of the war''s few Chinese-born American soldiers.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"usually,","B":"for instance,","C":"in any case,","D":"in doing so,"}'::jsonb, NULL, 'D', NULL, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '1-22', 22, 'mcq', 'The lack of accessible written sources is a common challenge faced by biographers of pre-nineteenth-century subjects. ______ when writing his biography of Alexander Hamilton (1755-1804), historian Ron Chernow had at his disposal Harold Syrett''s 26-volume, 19,000-document Papers of Alexander Hamilton.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"To take one well-known example,","B":"In accordance with this premise,","C":"It thus came as no surprise that,","D":"On the other end of the spectrum,"}'::jsonb, NULL, 'D', NULL, NULL, 23)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '1-23', 23, 'mcq', 'While researching a topic, a student has taken the following notes:
• India Arie is an African American singer and songwriter.
• The media outlet BBC Music has described her music as a "blend of hip hop, soul and folk [that is] as subtle as it [is] inspired."
• Her acclaimed albums feature many talented musicians.
• Judeh Insel played guitar on her first studio album, Acoustic Soul (2001).
• Ricky Quiñones played guitar on her second studio album, Voyage to India (2002).', NULL, 'The student wants to emphasize a difference between Judeh Insel and Ricky Quiñones. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Judeh Insel played guitar on India Arie''s first studio album, Acoustic Soul, which was released a year before her album Voyage to India.","B":"Both musicians have played on India Arie albums, but Judeh Insel played viola, whereas Ricky Quiñones played guitar.","C":"Acoustic Soul and Voyage to India, released in 2001 and 2002, respectively, are albums by singer and songwriter India Arie.","D":"Judeh Insel and Ricky Quiñones have both lent their musical talents to albums by India Arie."}'::jsonb, NULL, 'A', NULL, NULL, 24)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '1-24', 24, 'mcq', 'While researching a topic, a student has taken the following notes:
• A supercontinent is a large landmass made up of most or all of Earth''s continents.
• Over time, continents merge together to form supercontinents, which then break apart.
• This process is believed to take hundreds of millions of years and is known as the supercontinent cycle.
• Vaalbara was a supercontinent that formed about 3.6 billion years ago.
• Euramerica was a supercontinent that formed about 300 million years ago.', NULL, 'The student wants to emphasize the order in which the supercontinents were formed. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Vaalbara and Euramerica were both supercontinents, single landmasses made up of most or all of Earth''s continents.","B":"The supercontinent Euramerica formed long after the supercontinent Vaalbara.","C":"Forming and breaking apart over hundreds of millions of years, supercontinents are made up of most or all of Earth''s continents.","D":"Vaalbara formed about 3.6 billion years ago but eventually broke apart."}'::jsonb, NULL, 'B', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '1-25', 25, 'mcq', 'While researching a topic, a student has taken the following notes:
• Grimanesa Amorós is a Peruvian American artist well known for her LED light sculptures.
• Uros Island (2011) is from her Uros series of works.
• It is made of smooth multicolored LED domes.
• Golden Connection (2013) is from her Huanchaco series of works.
• It is made of entangled blue and white LED tubes.', NULL, 'The student wants to emphasize a difference between Uros Island and Golden Connection. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Grimanesa Amorós often employs LED lights in her work, but the smooth LED domes of Uros Island stand in contrast to the tangled LED tubes of Golden Connection.","B":"Uros Island and Golden Connection are two LED light sculptures by well-known artist Grimanesa Amorós.","C":"In 2011, Grimanesa Amorós debuted Uros Island, a part of her Uros series.","D":"Many of Grimanesa Amorós''s sculptures, like Uros Island and Golden Connection, incorporate LED lights in the form of domes or tubes."}'::jsonb, NULL, 'A', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '1-26', 26, 'mcq', 'While researching a topic, a student has taken the following notes:
• Refrigerants are chemical compounds used in cooling technologies, such as air conditioners.
• Air conditioners can use refrigerants to absorb heat and release cold air.
• The refrigerant dichloromethane is a hydrochlorocarbon (HCC).
• HCCs are composed of the elements hydrogen, chlorine, and carbon.
• The refrigerant tetradecafluorohexane is a perfluorocarbon (PFC).
• PFCs are composed of fluorine and carbon.', NULL, 'The student wants to contrast dichloromethane and tetradecafluorohexane. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Dichloromethane, a hydrochlorocarbon, is composed of hydrogen, chlorine, and carbon; tetradecafluorohexane, a perfluorocarbon, is composed of fluorine and carbon.","B":"Dichloromethane and tetradecafluorohexane are chemical compounds used in cooling technologies; the compounds are known as refrigerants.","C":"The hydrochlorocarbon dichloromethane and the perfluorocarbon tetradecafluorohexane are both refrigerants that can be used in cooling technologies like air conditioners.","D":"Tetradecafluorohexane, a refrigerant, can be used in cooling technologies to absorb heat and release cold air."}'::jsonb, NULL, 'A', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '1-27', 27, 'mcq', 'While researching a topic, a student has taken the following notes:
• The A. M. Turing Award is a prestigious award given by the Association for Computing Machinery (ACM).
• The ACM gives the award for "major contributions of lasting importance to computing."
• It is named after groundbreaking British mathematician Alan Turing.
• Raj Reddy won the award in 1994 for pioneering the development of large-scale artificial intelligence systems.', NULL, 'The student wants to explain whom the award is named for. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"In 1994, Raj Reddy won the A. M. Turing Award for pioneering the development of large-scale artificial intelligence systems.","B":"The A. M. Turing Award is given for \"major contributions of lasting importance to computing.\"","C":"The A. M. Turing Award is named for groundbreaking British mathematician Alan Turing.","D":"It was in 1994 that Raj Reddy won the A. M. Turing Award."}'::jsonb, NULL, 'C', NULL, NULL, 28)
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
  VALUES (v_mod, 1, '2-1', 1, 'mcq', 'Studying menus from nineteenth-century restaurants, old coupons clipped out of newspapers, and posters promoting concerts by long-forgotten musicians may seem like a frivolous pursuit, but ephemeral objects like these are useful as evidence of cultural change: they can ______ shifts in norms, values, and concerns that traditional objects of historical inquiry may not.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"dissociate from","B":"collude with","C":"compensate for","D":"attest to"}'::jsonb, NULL, 'D', NULL, NULL, 30)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '2-2', 2, 'mcq', 'In the architectural process called modular construction, a building is manufactured in modules under controlled conditions and then assembled at its intended location. ______ of this approach cite the production of less material waste and a faster return on investment.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"Components","B":"Safeguards","C":"Proponents","D":"Epitomes"}'::jsonb, NULL, 'C', NULL, NULL, 31)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '2-3', 3, 'mcq', 'Run by researchers in Europe, the Survey of Health, Ageing, and Retirement in Europe (SHARE) is an examination of aging that has attempted to track approximately 120,000 people for several years. Long-running studies like this need a lot of participants not merely for statistical robustness but also because of ______: over such a length of time, a substantial number of participants will withdraw or fall out of contact with the researchers.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"attrition","B":"circumspection","C":"impartiality","D":"replicability"}'::jsonb, NULL, 'A', NULL, NULL, 32)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '2-4', 4, 'mcq', 'Some ethicists challenge the concept of personal character, claiming that if it were meaningful, situational factors could not, as they clearly can, induce behavior contrary to that character. As Rachana Kamtekar observes, this argument is difficult to reconcile with our lay conception of character: we expect a person of helpful character to be frequently helpful, not ______ helpful.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"self-servingly","B":"sporadically","C":"grudgingly","D":"unfailingly"}'::jsonb, NULL, 'B', NULL, NULL, 33)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '2-5', 5, 'mcq', 'The Reckoning and Resilience (2022) exhibition at Duke University''s Nasher Museum of Art in Durham, North Carolina, was curated to feature the work of thirty North Carolina artists. The included artists represent a wide variety of artistic disciplines, from painters such as Juan Logan to the sculptor Stephen Hayes. In its inclusion of many borrowed works, the exhibition is atypical for the Nasher Museum, which tends to curate its exhibitions around the permanent collection of contemporary art that it owns.', NULL, 'Which choice best describes the overall structure of the text?', '{"A":"It explains how an art exhibition differs from many other exhibitions, then analyzes the significance of that difference.","B":"It presents the unusual goals curators had for an art exhibition, then evaluates whether the curators achieved those goals.","C":"It provides an overview of an art exhibition, then explains what makes the exhibition unusual for the institution that organized it.","D":"It discusses the wide range of disciplines represented in an art exhibition, then explains why curators included works in those disciplines."}'::jsonb, NULL, 'C', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '2-6', 6, 'mcq', 'The Heege Manuscript (HM) is a collection of booklets of once-unbound paper sheets on which Richard Heege copied various texts at his fifteenth-century home between Derbyshire and Nottinghamshire in England. Most other contemporaneous personal manuscripts like the Findern Anthology (FA) consist primarily of pieces by celebrated medieval authors like Hoccleve and other readings favored by elites, whereas the HM has a distinctive emphasis on the popular, including entertainments like crude comedies, and the practical, with advice about manners.', NULL, 'Which choice best describes the function of the underlined portion in the text as a whole?', '{"A":"To suggest that the FA is a poor point of comparison for a collection like the HM","B":"To emphasize the ubiquity of hand-copied collections like the FA and the HM in medieval England","C":"To provide context for the text''s suggestion that the HM is an outlier among collections of its time","D":"To illustrate how the discussion of the HM earlier in the text can improve historians'' understanding of the FA"}'::jsonb, NULL, 'C', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '2-7', 7, 'mcq', 'Text 1 is T. L. Hulme''s 1912 poem " Above the Dock." Text 2 is from Amy Lowell''s 1912 poem " The Crescent Moon."
Text 1
Above the quiet dock in mid night,
Tangled in the tall mast''s corded height,
Hangs the moon. What seemed so far away
Is but a child''s balloon, forgotten after play.
Text 2
Slipping softly through the sky
Little horned, happy moon,
Can you hear me up so high?
Will you come down soon?', NULL, 'Which choice best describes a notable difference in how the speaker of Text 1 and the speaker of Text 2 portray the moon?', '{"A":"While both speakers characterize the moon as an entrapped figure, only the speaker of Text 2 describes the moon as being content with this fate.","B":"While both speakers present the moon as a tangible object, only the speaker of Text 1 addresses the moon''s beauty.","C":"While both speakers present the moon as an object of play, the speaker of Text 1 presents the moon as an object of serious study.","D":"While the speaker of Text 1 presents the moon as seeming to be very close, the speaker of Text 2 emphasizes the moon''s distance from the speaker."}'::jsonb, NULL, 'D', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '2-8', 8, 'mcq', 'Mauricio Drelichman and Hans-Joachim Voth''s research into the debt defaults of Philip II (who ruled an empire including Spain and much of Belgium from 1556 to 1598) relates to other work on European early modern state finance, including Hoffman and Norberg''s research on the relationship between state finance and political development. But Drelichman and Voth''s unique contribution to the field is their reconstruction of the earliest extant set of annual fiscal records for any sovereign state, demonstrating in turn that Philip''s defaults were caused by short-term cash shortages, not long-term unsustainable debts.', NULL, 'Which choice best states the main idea of the text?', '{"A":"Analysis of the earliest available records of a sovereign state''s finances can be found not in the work of Hoffman and Norberg but in that of Drelichman and Voth.","B":"Drelichman and Voth advanced the field of research on European early modern state finance by assembling a novel collection of evidence that gave them insight into Philip II''s debt defaults.","C":"The research by Drelichman and Voth suggests that the logistics of ruling both Spain and much of Belgium led to short-term defaults with debt that forced Philip II to default on his debts.","D":"Drelichman and Voth''s research on Philip II''s debt defaults builds on earlier work by Hoffman and Norberg, adding nuance to the earlier work''s findings."}'::jsonb, NULL, 'B', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '2-9', 9, 'mcq', 'The following text is adapted from William Shakespeare''s 1597 play The Tragedy of King Richard III. Richard is reflecting on the recent arrest of his brother, the Duke of Clarence, on suspicion of treason against King Edward IV. Derby, Hastings, Buckingham, Rivers, Dorset, and Grey are also members of the English nobility.

RICHARD: I do the wrong, and first begin to brawl.
The secret mischiefs that I set [flowing]
I lay unto the grievous charge of others.
Clarence, whom I indeed have cast in darkness,
I do beweep to many simple [gullible people],
Namely, to Derby, Hastings, Buckingham;
And tell them ''tis the Queen and her allies
That stir the King against the Duke my brother.
Now they believe it, and withal whet me
To be revenged on Rivers, Dorset, Grey.', NULL, 'Which choice best describes what happens in the text?', '{"A":"Richard attributes Clarence''s troubles to both his own secret plotting and the distrust of Clarence that the queen and her allies Derby, Hastings, and Buckingham have planted in the king''s mind.","B":"Richard describes having wept as he informed Derby, Hastings, and Buckingham that the queen and her allies convinced the king to act against Clarence, and says that the earnestness of his grief caused them to accept his version of events.","C":"Richard acknowledges that his mischievous nature has spurred him to commit misdeeds in the past, including instigating enmity between the king and Clarence, but he regrets that he has hitherto not lost the trust of the queen and her allies.","D":"Richard indicates that he has pretended to be aggrieved about Clarence''s situation and has proclaimed it to be the fault of the queen and her allies, but in reality, he has caused the hostility the king feels toward Clarence."}'::jsonb, NULL, 'D', NULL, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '2-10', 10, 'mcq', 'Home Video Game Systems of the 1970s and 1980s

System | Manufacturer | System type | Approximate number of units sold worldwide
ColecoVision | Coleco | console | 2,000,000
Intellivision | Mattel | console | 3,000,000
MSX | ASCII Corp. | computer | 4,000,000
Game & Watch | Nintendo | handheld | 18,600,000

A student is writing a research paper on the global rise of home video game industry during the 1970s and 1980s. The student is surprised by differences in the number of units sold by some systems compared to those sold by others. Most remarkably, the ______', NULL, 'Which choice most effectively uses data from the table to complete the statement?', '{"A":"MSX sold approximately 4,000,000 units, whereas the Intellivision sold approximately 3,000,000 units.","B":"MSX sold approximately 18,600,000 units, whereas the Intellivision sold approximately 2,000,000 units.","C":"Game & Watch sold approximately 4,000,000 units, whereas the ColecoVision sold only approximately 3,000,000 units.","D":"Game & Watch sold approximately 18,600,000 units, whereas the ColecoVision sold only approximately 2,000,000 units."}'::jsonb, NULL, 'D', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '2-11', 11, 'mcq', 'In what is now southern Florida, the Calusa people (circa 1000–1600 CE) supported their relatively large population''s dietary needs with hydrological engineering rather than terrestrial farming methods. They constructed watercourts (gated coastal enclosures) out of shells and sediments to trap a variety of fish as waters rose and fell with tides and seasonal sea-level shifts; watercourt pools then held the fish for later consumption. Archaeologist Theresa Schober has posited an additional purpose of these enclosures, suggesting that they were also intended to foster sea snails. She has linked this hypothesis to the high value sea snails would have had for the Calusa, who could have used them both nutritionally and as a building material (conch shells are highly durable).', NULL, 'Which choice, if true, would most directly weaken Schober''s hypothesis?', '{"A":"Samples of animal remains collected at Calusa sites reflect a greater diversity of marine species, particularly among sea snails, within the perimeter of watercourts than in locations known to have been devoted to the preparation and consumption of food.","B":"Historical population-size estimates suggest that the sea snails and fish most common in the Calusa diet were plentiful in open coastal waters when the watercourts were constructed but decreased in abundance in the years immediately after construction.","C":"Radar surveys of Calusa sites reveal watercourt dimensions suitable for sustaining fish of many local species but not conducive for maintaining the shallow environments with ample seagrasses that allow sea snails to thrive.","D":"Sediment layers excavated from Calusa watercourt sites contain heterogeneous mixtures of scales from multiple species of fish and fragments of shells from various types of sea snails, but conch shells do not constitute the majority of the mixture in most of those layers."}'::jsonb, NULL, 'C', NULL, NULL, 40)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '2-12', 12, 'mcq', 'Observed Traits in a Population of Broadleaf Arrowhead, by Flowering Date
Trait | Day 5 | Day 10 | Day 15 | Day 20
Total number of open male and female flowers per growth unit | 25 | 65 | 110 | 45
Estimated reproductive success rate of male flowers | 0.29 | 0.29 | 0.29 | 0.29
Proportion of male flowers | 0.45 | 0.50 | 0.48 | 0.13
The mating environment hypothesis predicts that populations of flowering plants compensate for reduced mating opportunities due to dichogamy (a plant''s expression of male and female functions at separate times to prevent self-pollination) by adjusting the bias of floral sex allocation during the flowering period, increasing the probability of successful cross-plant pollination. Researchers tested the hypothesis by examining a population of broadleaf arrowhead, a plant species whose flowering period is longer for male flowers than for female flowers, during the flowering season. They concluded that the mating environment hypothesis is not well supported by their observational data.', NULL, 'Which choice best describes data from the table that support the researchers'' conclusion?', '{"A":"Whereas the total number of open flowers per growth unit peaked on day 15, the proportion of male flowers experienced a peak earlier in the flowering season, on day 10.","B":"Despite the sharp reduction in the total number of open flowers per growth unit from day 15 to 20, there was no decline in the estimated reproductive success rate of male flowers in that interval.","C":"Sex allocations were largely evenly distributed on days 10 and 15 but were female biased on days 5 and 20.","D":"Although sex allocations became overwhelmingly female biased by day 20, male flowers'' estimated reproductive success rate did not vary from day 5 to 20."}'::jsonb, NULL, 'D', NULL, NULL, 41)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '2-13', 13, 'mcq', 'Although Grant Tavinor concludes that computer games are art by virtue of their forming a subcategory of fiction, and Berys Gaut similarly places them within the realm of cinema, neither approach adequately captures a central aspect of playing these games: the point when the player no longer attends to the narrative and is instead simply absorbed in the instrumentalities of gameplay. This is among the reasons philosopher C. Thi Nguyen contends that the work of computer-game designers lies in what he calls the medium of player agency, which the designer prescribes through rules and goals and which elicits positive aesthetic experiences in the player who agrees to adopt it. Therefore, Nguyen''s position is that Tavinor''s and Gaut''s frameworks ______', NULL, 'Which choice most logically completes the text?', '{"A":"are helpful starting points for studying computer games as art, even though these frameworks are overly simplistic.","B":"are useful for analyzing the narrative aspects of computer games, even if neither attempts to address player agency.","C":"overstate the influence of fiction and cinema on the narrative elements of computer games.","D":"subsume computer games under other categories of media that do not address a feature of games that is integral to player enjoyment."}'::jsonb, NULL, 'D', NULL, NULL, 42)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '2-14', 14, 'mcq', 'As observed in a 2011 study by Emilio García-Robledo and Alfonso Corzo, macroalgal proliferation may have a suppressive effect on the abundance of cyanobacteria and other microphytobenthos (MPB) — chlorophyll-producing microbes inhabiting marine sediment —in part by reducing the amount of sunlight available to MPB. Examining benthic chlorophyll concentrations is widely used proxy for MPB biomass in mudflats in Curlew Bay and other coastal sites in Virginia. Alice F. Besterman and Michael L. Pace found that those concentrations did not negatively correlate with macroalgal proliferation. However, they noted that MPB may respond to low-light conditions by producing higher-than-normal concentrations of chlorophyll, and they thus concluded that ______', NULL, 'Which choice most logically completes the text?', '{"A":"researchers ought to account for the possibility that because MPB have the capacity to compensate for reduced sunlight availability, benthic chlorophyll concentrations may not always be a reliable indicator of MPB biomass.","B":"although their finding was inconsistent with that of García-Robledo and Corzo, this discrepancy was not attributable to the ability of MPB to accelerate chlorophyll production to mitigate the negative impact of macroalgal accumulations.","C":"although elevated levels of macroalgae do not always correspond to increased levels of benthic chlorophyll, there is likely a larger trend in MPB biomass that is reflected by the macroalgal presence but unrelated to light conditions.","D":"the effect of macroalgal concentrations on MPB abundance that García-Robledo and Corzo reported was not observed in Curlew Bay and other Virginia sites because low-light conditions likely are not generalizable across the sites in the studies."}'::jsonb, NULL, 'A', NULL, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '2-15', 15, 'mcq', 'Neuroscientist Artin Arsharnian and his team sought to determine what affects a person''s perception of an odor as pleasant: is it culture, personal taste, or aspects of human anatomy? The team assessed odor preferences in ten groups of people with different modes of living (urban, agricultural, and hunter-gatherer) including the Maniq people from a small community in Thailand and the Seri people from a small community in Mexico. The team observed that across cultures, people generally rated odors about the same: ethyl butyrate, which smells like peaches, was typically rated more pleasant than diethyl disulfide, which smells like garlic. The team''s study thus undermined the idea that ______', NULL, 'Which choice most logically completes the text?', '{"A":"a person who perceives certain odors as pleasant will likely perceive the odors as roughly equal in pleasantness.","B":"culture significantly influences whether a person perceives an odor as pleasant or unpleasant.","C":"personal taste has little influence on whether odors are perceived as pleasant or unpleasant.","D":"people agree in their perception of odors as pleasant or unpleasant regardless of where they live."}'::jsonb, NULL, 'B', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '2-16', 16, 'mcq', 'Many studies have found a positive association between levels of dissolved organic carbon and mercury in bodies of fresh water undisturbed by human activity. But Stéphane Guédron, Delphine Tisserand, and colleagues did not find this correlation in an examination of freshwater bodies impacted by wastewater, leading some scientists to hypothesize that the association could be particular to undisturbed waters. However, Ida Tjerngreen and colleagues carried out a study on freshwater bodies disturbed by urban development that showed similar results on the undisturbed waters, suggesting that ______', NULL, 'Which choice most logically completes the text?', '{"A":"levels of dissolved organic carbon and mercury are both much higher in bodies of fresh water impacted by wastewater than they are in bodies of fresh water disturbed by urban development.","B":"Guédron, Tisserand, and colleagues'' study used different methods to measure the concentration of mercury in fresh water than Tjerngren and colleagues'' study did.","C":"the effects of wastewater on the association between levels of dissolved organic carbon and mercury should not be taken as indicative of the effects of every type of human disturbance.","D":"disturbances linked to wastewater affect significantly more bodies of fresh water than disturbances linked to urban development do."}'::jsonb, NULL, 'C', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '2-17', 17, 'mcq', 'Branching in Jurisprudential Schools is one of the hundreds of thousands of manuscripts that have survived from roughly the sixteenth century to the present ______ being passed down through private libraries in the city of Timbuktu, Mali. Many of these manuscripts can be found at the Al-Wangari Manuscript Library.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"day by","B":"day; by","C":"day. By","D":"day by,"}'::jsonb, NULL, 'A', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '2-18', 18, 'mcq', 'The terms included in Barry Lopez and Debra Gwartney''s Home Ground: A Guide to the American ______ such as "karst," which refers to limestone terrain riddle with caves or sinkholes — illustrate the rich vocabulary used to describe the landforms of North America.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"Landscape,","B":"Landscape:","C":"Landscape —","D":"Landscape"}'::jsonb, NULL, 'C', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '2-19', 19, 'mcq', 'Following the formation of the European Union (EU) that same year, the organizers of the 1992 Tour de France wanted the bike race to reflect the cross-national flow of people and trade that the EU had made possible. The resulting course was 2,500 miles long ______ seven separate borders of neighboring countries, modeled a vision of the EU''s unifying aims.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"and, crossed","B":"and had crossed","C":"and crossed","D":"and, crossing"}'::jsonb, NULL, 'D', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '2-20', 20, 'mcq', 'As part of his I GOT UP series, Japanese conceptual artist On Kawara spent over a decade — with near daily consistency — mailing postcards to friends declaring what time he got up each day, resulting in pieces such as I GOT UP at 7.19 A. M. Jun 6 1977. Such meticulous documentation of mundane ______ artworks that "resonate with existential, psychological and scientific implications about the time-space continuum," according to the New York Times, became Kawara''s life''s work.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"information, has generated","B":"information generates","C":"information, generating","D":"information generated"}'::jsonb, NULL, 'C', NULL, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '2-21', 21, 'mcq', 'For her film I Am Somebody (1970), a documentary about a successful months-long strike held by Black female hospital workers in Charleston, South Carolina, director Madeline Anderson chose a narrator who had participated in the ______ by allowing the narrative to be shaped by one of their own, amplified the agency and power the workers possessed.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"protest a decision that,","B":"protest. A decision that","C":"protest; a decision that,","D":"protest, a decision that,"}'::jsonb, NULL, 'D', NULL, NULL, 50)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '2-22', 22, 'mcq', 'At a time when many women writers used male pseudonyms to gain greater freedom of self-expression by evading gender conventions, Katherine Bradley and Edith Cooper adapted the practice by publishing poetry, prose, and drama for four decades under the shared name Michael Field. ______ the duo was able to express the joint creative vision that sustained their long personal and professional partnership.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"In this way,","B":"For instance,","C":"Later,","D":"On the other hand,"}'::jsonb, NULL, 'A', NULL, NULL, 51)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '2-23', 23, 'mcq', 'In a 2005 study by Mellado et al., the researchers'' aim was to analyze the diet composition of cattle in Coahuila, Mexico. ______ they aimed to analyze the ratio of three different plant subtypes within these animals'' diet: graminoids, forbs, and browse.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Instead,","B":"All the same,","C":"Therefore,","D":"Specifically,"}'::jsonb, NULL, 'D', NULL, NULL, 52)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '2-24', 24, 'mcq', 'John Quincy Adams employed the pseudonym "Marcellus" — a reference to a leader of an ancient Roman army — in political essays he wrote in 1793, a choice that accomplished far more than simply concealing his authorship. ______ it wasn''t an arbitrary pen name but rather a complex rhetorical strategy through which Adams aligned his political views with the venerated republican ideals of the ancient world, thereby bolstering the authority of his writing.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Conversely,","B":"In addition,","C":"However,","D":"Indeed,"}'::jsonb, NULL, 'D', NULL, NULL, 53)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '2-25', 25, 'mcq', 'While researching a topic, a student has taken the following notes:
• Kale is a vegetable that contains ascorbic acid, an essential nutrient for humans.
• Apricots are fruits that contain ascorbic acid.
• There is 120 milligrams (mg) of ascorbic acid per every 100 grams (g) of kale.
• There is 10 mg of ascorbic acid per every 100g of apricot.
• Humans cannot make ascorbic acid in their bodies, so they must get it from foods, including fruits and vegetables.
• Ascorbic acid is also known as vitamin C.', NULL, 'The student wants to refute a claim that apricots are a better source of vitamin C than kale is. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Kale contains vitamin C (also known as ascorbic acid); in fact, kale is 120 mg of vitamin C in every 100g of kale.","B":"Kale contains ascorbic acid (also known as vitamin C), and apricots do too.","C":"Humans cannot make ascorbic acid in their bodies, but they can get it from kale and apricots.","D":"With 120 mg of vitamin C per every 100g, kale is actually a better source of vitamin C than apricots, which contain only 10 mg per every 100g."}'::jsonb, NULL, 'D', NULL, NULL, 54)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '2-26', 26, 'mcq', 'While researching a topic, a student has taken the following notes:
• Snow hydrologist Julie Koeberle helps maintain automated snow measurement stations.
• They are called SNOTEL sites.
• There are around 90 stations throughout Wyoming.
• One is at Bear Trap Meadow.
• The data collected can help researchers make downstream water supply predictions.', NULL, 'Which choice most effectively uses information from the given sentences to provide an example of a SNOTEL site?', '{"A":"The data collected by SNOTEL sites can help researchers predict downstream water supplies.","B":"The SNOTEL site at Bear Trap Meadow is one of around 90 automated snow measurement stations in Wyoming.","C":"Snow hydrologist Julie Koeberle helps maintain automated snow monitoring stations known as SNOTEL sites.","D":"Located throughout Wyoming, SNOTEL sites monitor snow conditions."}'::jsonb, NULL, 'B', NULL, NULL, 55)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '2-27', 27, 'mcq', 'While researching a topic, a student has taken the following notes:
- The nautical mile (6,076 feet) is the measure of distance used in seafaring navigation.
- A nautical mile directly correlates to one minute (1/60th of a degree) of latitude.
- The curvature of Earth affects the accurate measurement of long distances when using flat maps.
- Measuring distances with latitude and longitude coordinates takes into account Earth''s curvature.
- Mariners use nautical charts marked with latitude and longitude to quickly calculate distances and positions.', NULL, 'The student wants to explain why nautical miles are used to measure distances in seafaring navigation. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Nautical miles are a measure of distance equal to one minute of latitude, which is a feature nautical charts use to calculate distances and positions.","B":"Nautical charts use latitude and longitude to measure long distances; these charts are more accurate than flat maps for measuring distances in seafaring navigation because they account for Earth''s curvature.","C":"Since they directly correlate to the coordinates on nautical charts, which take into account Earth''s curvature, nautical miles are an efficient way to calculate distances at sea.","D":"Using nautical miles for navigation at sea takes Earth''s curvature into account, whereas measuring distances with latitude and longitude coordinates does not."}'::jsonb, NULL, 'C', NULL, NULL, 56)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
END $seed$;
