-- =============================================================================
-- Migration: 0119_seed_dsat_2026_mar_asia_a.sql
-- Purpose:   Seed "Test #6 — Digital SAT, March 2026 (Asia-Pacific, Form A)"
--            into the full-test tables from 0048.
--
--   Source:  2026-03-asia-a.pdf (Two Engineers Prep, Bluebook-format reconstruction).
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
  VALUES ('dsat-2026-mar-asia-a', 6, 'Test #6 — Digital SAT, March 2026 (Asia-Pacific, Form A)', 'DSAT Mar 2026 Asia A', '2026-03-asia-a.pdf', 98)
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
  VALUES (v_mod, 1, '1-1', 1, 'mcq', 'Lima beans were domesticated in South America. Their physical structure is no longer identical to the structure of the wild plant they are descended from. Summer squash also ______ its wild ancestor. That ancestor plant had a hard rind and bitter flesh. Indigenous people in eastern North America carefully bred the crop until it had a soft rind and mild-tasting flesh.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"reacts to","B":"helps with","C":"varies from","D":"argues with"}'::jsonb, NULL, 'C', NULL, NULL, 2)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '1-2', 2, 'mcq', '"Eyes of Zapata" is an English-language short story by Sandra Cisneros. It occasionally includes Spanish words and phrases. The English text surrounding these words and phrases ______ their meaning, so readers who aren''t familiar with Spanish can easily read the story. Ana Castillo takes the same approach in her novel So Far from God.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"loses","B":"purchases","C":"suspects","D":"suggests"}'::jsonb, NULL, 'D', NULL, NULL, 3)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '1-3', 3, 'mcq', 'The following text is from Billie Jean King''s 2021 autobiography All In.
[P]eople on both sides of my family had repeatedly demonstrated an independent streak. In the end, that was the temperament I gravitated toward, too. Both the Moffitts and the members of my mother''s clan, the Jermans, came from mining and oil-geyser towns on the western frontier. They kept their heads down and worked, worked, worked. But they also bucked convention.', NULL, 'As used in the text, what does the word "demonstrated" most nearly mean?', '{"A":"Defined","B":"Exhibited","C":"Confirmed","D":"Protested"}'::jsonb, NULL, 'B', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '1-4', 4, 'mcq', 'Scientists studying marine ecosystems were surprised by the extent of internal carbon recycling by red coralline algae. While some ______ of carbon was expected, the scientists found that the algae reabsorb nearly 40% of the carbon dioxide they produce during calcification processes and harness it for photosynthesis.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"reuse","B":"supply","C":"imitation","D":"examination"}'::jsonb, NULL, 'A', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '1-5', 5, 'mcq', 'The dinosaur displays at museums such as the American Museum of Natural History in New York (which has a mounted Allosaurus fragilis skeleton among its holdings) are notable for the ______ of the research behind them—the museum staff consulted numerous sources to ensure the accuracy of the displays.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"novelty","B":"obscurity","C":"rigor","D":"shallowness"}'::jsonb, NULL, 'C', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '1-6', 6, 'mcq', 'The Nazca lines in Peru are designs marked in the earth by ancient peoples. Monuments like these were an inspiration for the land art movement that began in the 1960s. Land art artists create works set in the outdoors. For example, in his 1968 work Annual Rings, Dennis Oppenheimer fashioned concentric lines that look like tree rings into the ice that covered a waterway.', NULL, 'Which choice best states the main purpose of the text?', '{"A":"The text describes the benefits of being an artist.","B":"The text argues against placing works of art outside.","C":"The text describes the popularity of art galleries in the 1960s.","D":"The text provides information about the land art movement."}'::jsonb, NULL, 'D', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '1-7', 7, 'mcq', 'Though Chloé Zhao''s films are fictional, she incorporates real events into them in a documentary-like style and casts nonprofessional actors who reside in the places that she aims to portray. She also encourages these actors, whether they are teenagers living on the Pine Ridge Indian Reservation or adults who travel the country for work, to put as much of themselves into their roles as possible. Her approach adds powerful resonance to films that explore the highly personal experiences of place and home, and often the difficult decision to stay or leave.', NULL, 'Which choice best states the main purpose of the text?', '{"A":"To summarize how Chloé Zhao''s style of filmmaking changed over the course of her career","B":"To discuss how Chloé Zhao''s background in documentary filmmaking has influenced her storytelling style in films","C":"To argue that Chloé Zhao''s films are best understood as documentaries","D":"To emphasize that Chloé Zhao''s decisions during the filmmaking process reinforce the themes of her films"}'::jsonb, NULL, 'D', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '1-8', 8, 'mcq', 'Many initiatives aimed at limiting atmospheric warming focus on curbing emissions of methane (CH₄), a greenhouse gas that is typically generated by microbially mediated processes. Lisa Y. Stein and Mary E. Lidstrom caution that under certain circumstances, such efforts cause microbial communities to accelerate production of nitrous oxide (N₂O), another potent greenhouse gas, thus offsetting the impact of CH₄ reduction. Researchers, therefore, need to take such biological interactions into account to ensure that any CH₄ mitigation strategy has an overall positive climate effect.', NULL, 'Which choice best describes the overall structure of the text?', '{"A":"It presents an ongoing environmental challenge, demonstrates why the impact of that challenge may intensify over time, and then criticizes a misguided attempt to address that impact.","B":"It describes a widely accepted approach to addressing an environmental issue caused by a type of chemical emissions, indicates a potential disadvantage of that approach, and then discusses an implication of that disadvantage.","C":"It reports on a predicament resulting from emissions of a particular greenhouse gas, outlines a strategy aimed at solving that predicament, and then admonishes those who utilize that strategy without fully comprehending its ramifications.","D":"It introduces a common strategy for mitigating emissions of one greenhouse gas, explains how that strategy could inadvertently increase emissions of another greenhouse gas, and then calls for a more comprehensive approach that accounts for such interactions."}'::jsonb, NULL, 'D', NULL, NULL, 9)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '1-9', 9, 'mcq', 'A debut novel is the first book that an author has published. An example of a debut novel is Freak the Mighty by Rodman Philbrick. It was published in 1993. Debut novels are especially interesting to literary critics and readers because these books offer a look at new voices in the literary world.', NULL, 'Which choice best states the main topic of the text?', '{"A":"Debut novels","B":"Famous literary critics","C":"The benefits of reading","D":"Careers in the publishing industry"}'::jsonb, NULL, 'A', NULL, NULL, 10)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '1-10', 10, 'mcq', 'Seventeenth-century Flemish artist Clara Peeters played a crucial role in the history of still-life painting. At a time when historical paintings were the preferred genre — indeed, at a time when there wasn''t even a term for still-life painting in Peeters''s language — Peeters painted food, flowers, fish, and game. Her influence spread throughout Western Europe and she became so strongly associated with the genre that painters who took up similar subjects were sometimes described as belonging to the "circle of Peeters."', NULL, 'Which choice best states the main idea of the text?', '{"A":"Clara Peeters was an important figure in the development of still-life painting.","B":"Clara Peeters made significant contributions to multiple genres of painting.","C":"Clara Peeters introduced the term \"still-life painting\" to Western Europe.","D":"Some paintings attributed to Clara Peeters may have been painted by other artists in her circle."}'::jsonb, NULL, 'A', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '1-11', 11, 'mcq', 'Great Expectations is an 1861 novel by Charles Dickens. The narrator describes his uncle, Joe Gargery, as being both powerful and tender: ______', NULL, 'Which quotation from Great Expectations most effectively illustrates the claim?', '{"A":"\"In his working-clothes, Joe was a well-knit characteristic-looking blacksmith; in his holiday clothes, he was more like a scarecrow in good circumstances, than anything else.\"","B":"\"When I looked back at Joe in the long passage, he was still weighing his hat with the greatest care, and was coming after us in long strides on the tips of his toes.\"","C":"\"There I stood, for minutes, looking at Joe, already at work with a glow of health and strength upon his face that made it show as if the bright sun of the life in store for him were shining on it.\"","D":"\"Joe laid his hand upon my shoulder with the touch of a woman. I have often thought him since, like the steam-hammer that can crush a man or pat an egg-shell, in his combination of strength with gentleness.\""}'::jsonb, NULL, 'D', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '1-12', 12, 'mcq', 'Fish Population in a Taiwanese Tide Pool, January 2001 to October 2001
[Graph: Line chart with y-axis "Number of individual fish" (0–65) and x-axis "Month" (January 2001 through October 2001). Three species tracked: combtooth blenny (solid line), barred flagtail (dashed line with open circles), striated rockshipper (dotted line with open circles).]

Lin-Tai Ho and colleagues monitored fish populations in a tide pool in Taiwan. They found that some species were entirely absent from the tide pool at particular times of the year; for example, they did not observe even one ______', NULL, 'Which choice most effectively uses data from the graph to complete the example?', '{"A":"barred flagtail in January of 2001.","B":"striated rockshipper in January and April of 2001.","C":"barred flagtail in October of 2001.","D":"combtooth blenny in January of 2001."}'::jsonb, NULL, 'A', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '1-13', 13, 'mcq', 'Researchers have identified over eighty gestures made by nonhuman great apes, such as raising an arm and rocking from side to side, that appear to convey information and that seem to be biologically inherited. Kirsty E. Graham and Catherine Hobaiter hypothesized that humans may be able to interpret great ape gestures, either through an evolutionary inheritance or as part of more general human cognitive abilities. The researchers tested this hypothesis by enlisting participants in an online game in which they had to correctly identify the meanings of ape gestures seen in videos. Though participants achieved some success, it is unclear whether they sometimes did so by making use of additional context provided by the images or sounds in the video recordings.', NULL, 'Which statement, if true, would most strongly support the underlined claim?', '{"A":"When apes made mouth-touching gestures, which participants tended to correctly interpret as requests for food, the food was visible in the videos.","B":"Participants correctly identified gestures at the same rate for videos in which the apes made sounds in addition to gestures and videos in which the apes were silent.","C":"Participants correctly interpreted ape gestures more than 50 percent of the time, whereas they would have only identified gestures correctly 25 percent of the time if they had been guessing.","D":"Participants correctly interpreted gestures even when the videos were muted and the ape''s surroundings were blurred, leaving only the gesture itself visible."}'::jsonb, NULL, 'A', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '1-14', 14, 'mcq', 'Biochemists I. Sam Saguy and Eli J. Pinthus studied the mass and heat transfer processes that occur when foods, such as the Indian snacks batata vada and sabudana vada, are fried in oil. During frying, water in the crust evaporates, leaving voids that oil can fill, thereby increasing the food''s fat content. As the process continues, water from the food''s center moves to the crust as long as the crust remains permeable. Therefore, the more moisture a food loses during frying, ______', NULL, 'Which choice most logically completes the text?', '{"A":"the lower the temperature must be to fry the food.","B":"the softer the crust will be when frying is completed.","C":"the higher the fat content will be when frying is completed.","D":"the quicker the crust will lose its permeability."}'::jsonb, NULL, 'C', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '1-15', 15, 'mcq', 'The kawau tree is one of many forest plant species native to Oahu (a Hawaiian island) that are at risk of extinction in the wild. Ecologists say that fruit-eating birds help support these species'' population numbers by dropping seeds from the plants'' fruits to different spots where new plants can grow. The birds native to Oahu that used to do this have all gone extinct over time. However, the common waxbill and other fruit-eating bird species brought to the island in the last 150 years have been found to spread plant seeds. Based on this finding, some ecologists suggest that kawau trees and other forest plants native to Oahu ______', NULL, 'Which choice most logically completes the text?', '{"A":"were likely already close to extinction long before non-native birds arrived on the island.","B":"probably established themselves on the island at about the same time as common waxbills and other fruit-eating birds did.","C":"seem to produce fewer fruits per plant now than they did when fruit-eating birds native to the island were still present.","D":"may now depend on non-native birds, such as the common waxbill, to help maintain and increase their populations on the island."}'::jsonb, NULL, 'D', NULL, NULL, 16)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '1-16', 16, 'mcq', 'Though they are in different countries, the towns of Entebbe, Uganda, and Booue, Gabon, ______ They are among the rare places that sit almost directly on the equator.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"do have something in common?","B":"do they have something in common.","C":"do they have something in common?","D":"do have something in common."}'::jsonb, NULL, 'D', NULL, NULL, 17)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '1-17', 17, 'mcq', 'Pumpkins were among the many plant species from the Western Hemisphere introduced into the Eastern Hemisphere in the years following Christopher Columbus''s first transatlantic voyage in 1492. This ongoing transfer of species between hemispheres ______ now known as the Columbian Exchange.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"being","B":"are","C":"is","D":"were"}'::jsonb, NULL, 'C', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '1-18', 18, 'mcq', 'Among several noun cases used in Sanskrit and other Indo-Aryan languages ______ the locative case, used to indicate that an action is occurring in, at, on, or near a particular noun.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"have been","B":"are","C":"is","D":"were"}'::jsonb, NULL, 'C', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '1-19', 19, 'mcq', 'It was long thought that maize was domesticated solely from *parviflumis* — a subspecies of teosinte, a wild grass — in Mexico''s lowlands about 9,000 years ago. However, a 2024 analysis has revealed that between 15 and 25 percent of maize''s genes can be traced to a second ______ highland subspecies of teosinte that was hybridized with maize around 4,000 years after the initial domestication.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"ancestor; mexicaca, a","B":"ancestor: mexicaca, a","C":"ancestor mexicaca a","D":"ancestor, mexicaca. A"}'::jsonb, NULL, 'B', NULL, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '1-20', 20, 'mcq', 'Hummingbird flower mites use electroreception to detect electric fields created by flapping hummingbird wings, allowing mites to travel from flower to flower in hummingbird beaks. Both host detection and transportation are electrically ______ when mites move their legs toward the arriving hummingbird, they are pulled by electrostatic force to the bird''s modulated electric fields — a process that occurs in milliseconds.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"mediated,","B":"mediated","C":"mediated:","D":"mediated and"}'::jsonb, NULL, 'C', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '1-21', 21, 'mcq', 'The World Cup of men''s soccer, one of the biggest sporting events on the planet, brought 32 national teams from six continents to the host country, Germany, in 2006. The event, which is held every four years, used to be much smaller and more limited geographically. ______ the 1930 World Cup in Uruguay included only 13 teams, all from Europe and the Americas.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"In addition,","B":"At last,","C":"For example,","D":"However,"}'::jsonb, NULL, 'C', NULL, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '1-22', 22, 'mcq', 'Karel Čapek''s 1920 play *R.U.R.* (*Rossum''s Universal Robots*), in which artificial workers overthrow their masters, left an indelible mark on the science fiction genre, and the English language, by introducing the term "robot" (derived from the Czech word *robota*, meaning "indentured labor" or "drudgery"). ______ Čapek''s play also contributed to a venerable literary and mythological tradition: using artificial beings as mirrors and foils for humanity.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"By achieving such a lofty goal,","B":"Beyond the simple coining of a term,","C":"Despite its creation of such an iconic trope,","D":"Ultimately limited in its lasting influence,"}'::jsonb, NULL, 'B', NULL, NULL, 23)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '1-23', 23, 'mcq', 'While researching a topic, a student has taken the following notes:
• *Letters from a Peruvian Woman* (1747) is an epistolary novel by French author Françoise de Graffigny.
• Epistolary novels are novels written primarily as a series of fictional documents.
• These documents can be letters, journal entries, newspaper clippings, and more.
• *Letters from a Peruvian Woman* consists primarily of letters.
• The letters are sent between a captured Incan princess and her fiancé.', NULL, 'The student wants to define the term "epistolary novel." Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Published in 1747, *Letters from a Peruvian Woman* is an epistolary novel by French author Françoise de Graffigny.","B":"Françoise de Graffigny''s novel *Letters from a Peruvian Woman* was published in 1747 and consists primarily of letters exchanged between a captured Incan princess and her fiancé.","C":"Consisting primarily of letters exchanged between a captured Incan princess and her fiancé, Françoise de Graffigny''s *Letters from a Peruvian Woman* is an epistolary novel.","D":"An epistolary novel is a novel written primarily as a series of fictional documents, such as letters, journal entries, or newspaper clippings."}'::jsonb, NULL, 'D', NULL, NULL, 24)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '1-24', 24, 'mcq', 'While researching a topic, a student has taken the following notes:
• The human tongue contains taste receptors for a rich, savory flavor called umami.
• Umami is triggered by the compounds in a variety of foods, including sardines and mushrooms.
• Participants in a study tasted a sample of wakame, a type of brown seaweed.
• They rated its umami intensity as moderate.
• The participants tasted a sample of ma-konbu, another type of brown seaweed.
• They rated its umami intensity as high.', NULL, 'The student wants to emphasize a difference between the two seaweeds. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"While wakame and ma-konbu contain umami flavor, umami can also be found in sardines and mushrooms.","B":"After tasting two types of brown seaweed, wakame and ma-konbu, participants in a study found ma-konbu''s umami flavor to be the more intense of the two.","C":"Wakame is a type of brown seaweed, but so is ma-konbu.","D":"Some types of brown seaweed, like wakame and ma-konbu, trigger umami flavor in human taste buds."}'::jsonb, NULL, 'B', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '1-25', 25, 'mcq', 'While researching a topic, a student has taken the following notes:
• An isthmus is a strip of land that connects two larger pieces of land across an expanse of water.
• It is also known as a land bridge.
• The Isthmus of Tehuantepec is located in Mexico.
• It connects the southern tip of Mexico to the northern part of Mexico.', NULL, 'The student wants to provide a specific example of an isthmus. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"There is a land bridge in Mexico.","B":"One example of an isthmus is the Isthmus of Tehuantepec in Mexico.","C":"An isthmus, also known as a land bridge, is a strip of land that connects two larger pieces of land across an expanse of water.","D":"In Mexico, the southern tip of Mexico is connected to the northern part of Mexico."}'::jsonb, NULL, 'B', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '1-26', 26, 'mcq', 'While researching a topic, a student has taken the following notes:
• Albert Einstein''s theory of general relativity allows for potential shortcuts through spacetime.
• These hypothetical spacetime tunnels are known as wormholes.
• For matter to travel through a wormhole, it would need to have negative energy density.
• Negative energy density means that the matter would have less energy than empty space.
• Such matter has not been shown to exist.', NULL, 'The student wants to acknowledge a complication affecting travel through wormholes. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"The hypothetical tunnels known as wormholes would be potential shortcuts through spacetime were it not for one complication: they have less energy than empty space.","B":"Einstein''s theory of general relativity allows for potential spacetime shortcuts called wormholes but does not explain how matter with negative energy density could travel through them.","C":"For matter to travel through a wormhole, the matter would need to have less energy than empty space; such matter has not been shown to exist.","D":"Wormholes are hypothetical tunnels in spacetime that could allow for shortcuts, but no matter has yet been found that can travel through them without being destroyed."}'::jsonb, NULL, 'C', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '1-27', 27, 'mcq', 'While researching a topic, a student has taken the following notes:
• Shanawidthit (1801-1829) was a Beothuk cartographer (mapmaker).
• Her maps of Newfoundland''s Beothuk Lake outline both the lake and various points around the lake where encounters between the Indigenous Beothuk people and British colonists occurred.
• Her maps are notable for depicting the experiences the Beothuk had within the landscape.
• Contemporary Potawatomi cartographer Margaret Pearce: Indigenous cartography emphasizes "experienced space, or place, as opposed to the Western convention of depicting space as universal, homogenized, and devoid of human experience."
• Pearce: "Indigenous cartographies are as diverse as Indigenous cultures, from Hawaiian performative cartographies to Navajo verbal maps and sand paintings."', NULL, 'The student wants to describe Shanawidthit''s approach and explain its significance. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Shanawidthit''s maps are part of a broader tradition of Indigenous cartography that, according to Pearce, ranges from \"Hawaiian performative cartographies to Navajo verbal maps and sand paintings.\"","B":"Shanawidthit mapped Beothuk Lake through significant encounters that occurred there, which Pearce describes as \"depicting space as universal [and] homogenized.\"","C":"By depicting experiences of the Beothuk that occurred around Beothuk Lake, Shanawidthit''s maps reflect Indigenous cartography''s emphasis on \"experienced space, or place\" rather than the landscape alone.","D":"Shanawidthit''s maps of Beothuk Lake were created in the early nineteenth century, making them among the earliest known examples of Indigenous cartography in Newfoundland."}'::jsonb, NULL, 'C', NULL, NULL, 28)
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
  VALUES (v_mod, 1, '2-1', 1, 'mcq', 'Although more documentaries are being made than ever before, too many seem ______, offering stories without any depth. In a refreshing contrast, Ahmir "Questlove" Thompson''s 2021 documentary Summer of Soul (...or, When the Revolution Could Not Be Televised) draws from present-day interviews to supply compelling historical and social context for footage of the 1969 Harlem Cultural Festival.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"cryptic","B":"inaccessible","C":"haughty","D":"perfunctory"}'::jsonb, NULL, 'D', NULL, NULL, 30)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '2-2', 2, 'mcq', 'Among saltwater fish species, there is a clear association between habitat latitude and morphological variety. While tropical species are ______ deepbodied physical forms (body shapes that are laterally compressed but vertically extended), polar and temperate species are highly dispersed across the morphological spectrum.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"authenticated by","B":"concentrated among","C":"habituated to","D":"contemporary with"}'::jsonb, NULL, 'B', NULL, NULL, 31)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '2-3', 3, 'mcq', 'The following text is adapted from Edith Wharton''s 1911 novella Ethan Frome. The narrator has asked the woman he rents a room from about Ethan Frome, a town resident he encountered recently.

Her mind was a store-house of innocuous anecdote and any question about her acquaintances brought forth a volume of detail; but on the subject of Ethan Frome I found her unexpectedly reticent. There was no hint of disapproval in her reserve; I merely felt in her an insurmountable reluctance to speak of him.', NULL, 'As used in the text, what does the word "reserve" most nearly mean?', '{"A":"Misgiving","B":"Constraint","C":"Composure","D":"Modesty"}'::jsonb, NULL, 'B', NULL, NULL, 32)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '2-4', 4, 'mcq', 'The work of Tobias Gerstenberg et al. on tracking eye movements supports a theory that people envision ______ scenarios when making causal judgments: when subjects were asked to look at two colliding billiard balls and judge whether one caused or prevented the other''s movement through a gate, their eyes looked at where the target ball would have gone if the ball that altered its path did not exist.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"ambivalent","B":"retrospective","C":"counterfactual","D":"analogical"}'::jsonb, NULL, 'C', NULL, NULL, 33)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '2-5', 5, 'mcq', 'Paul Linebarger is often recognized as an influential science fiction writer (under the pen name Cordwainer Smith), but his most significant work was a 1940s classified US Army guide exploring the role of propaganda in times of war. Citing the uniquely absorbing nature of motion pictures, he contended that US propaganda should equal popular films in its appeal, entertaining audiences while engendering views of the nation as an ally. Linebarger''s work shaped the distinctive US approach to promoting national interests, one that continues to draw inspiration from elements of pop culture.', NULL, 'Which choice best describes the overall structure of the text?', '{"A":"It distinguishes a work from others in its genre, outlines the central objective of that work, and then addresses a recent resurgence of interest in that work.","B":"It sketches the development of a prominent work, familiarizes readers with an argument in that work, and then suggests that the work has had repercussions in other fields.","C":"It characterizes a work as having been underappreciated, describes a core concept in that work, and then argues that the influence of that concept is recognizable in other works.","D":"It introduces a significant work, summarizes a noteworthy idea in that work, and then places that idea into a context that demonstrates its broader implications."}'::jsonb, NULL, 'D', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '2-6', 6, 'mcq', 'Text 1
In separate studies, Lingbo Meng and colleagues and Xinhua He and colleagues examined whether plants transfer nutrients to one another using a common mycorrhizal network (CMN) — a lattice of fungal strands in the soil. Meng and colleagues excluded all pathways other than the CMN by using barriers to keep the plants'' root systems separate while allowing mycorrhizal strands through — a crucial step He and colleagues'' study did not take.
Text 2
Meng and colleagues took the necessary precaution of separating the plants'' root systems (thereby excluding root-to-root transmission). However, any barrier used must allow the thread-like hyphae of a CMN to pass through, and this permeability would also allow liquids through. Thus, the researchers'' experimental design cannot ensure that any nutrient transfer observed can be attributed to a CMN and not to some other pathway.', NULL, 'Based on the texts, how would the author of Text 2 most likely respond to the characterization of Meng and colleagues'' study in Text 1?', '{"A":"By asserting that the author of Text 1 has overstated the effectiveness of the method that Meng and colleagues used","B":"By pointing out that the author of Text 1 has overlooked studies that reported results that contradict those reported by Meng and colleagues","C":"By claiming that the author of Text 1 has misrepresented what Meng and colleagues were trying to achieve with their experimental design","D":"By arguing that the author of Text 1 has conflated the method used by Meng and colleagues with that used by He and colleagues"}'::jsonb, NULL, 'A', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '2-7', 7, 'mcq', 'The fifteenth-century English Heege Manuscript is unusual among collections of its kind and time given its focus on fantasy tales over more acclaimed works by celebrated medieval authors like Hoccleve. But according to professor James Wade, even more unusually, the three texts in the manuscript''s first booklet were likely copied by Richard Heege from a traveling minstrel''s repertoire book. The evidence includes performative elements such as the narrator politely addressing the audience, joking about peasants and royalty, and making jokes that could be modified to refer to the town of Radford when in nearby Brackonwet to avoid giving offense.', NULL, 'As presented in the text, Wade would most likely agree with which statement about the first booklet of the Heege Manuscript?', '{"A":"It was likely a copy Heege intended to give to a traveling minstrel working in the area around Radford and Brackonwet.","B":"The texts it includes were based on stories about the area around Radford and Brackonwet, but these names were later removed.","C":"It was copied from a text that originated from a traveling minstrel who worked in the area around Radford and Brackonwet.","D":"It was written down by Heege from memory based on a performance by a traveling minstrel who worked in the area around Radford and Brackonwet."}'::jsonb, NULL, 'C', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '2-8', 8, 'mcq', 'Within higher education, studying philosophy requires that students be conversant with the field''s foundational texts and historical figures. By contrast, doing philosophy within or beyond the academy demands the creative, self-directed application of acquired expertise to enduring questions about the nature of existence and knowledge. While both approaches engage with influential figures, those who do philosophy treat such figures as vital interlocutors who facilitate new insights rather than as ossified authorities who, though relevant to the present, primarily represent the discipline''s past.', NULL, 'Based on the text, which choice best describes the relationship between doing philosophy and studying philosophy?', '{"A":"Doing philosophy involves developing novel ideas through imagined dialogue with past philosophers based on knowledge of those philosophers'' views acquired by studying philosophy.","B":"Doing philosophy helps students formulate concrete solutions to practical issues, whereas studying philosophy prioritizes engagement with historical arguments in the field.","C":"Doing philosophy represents a departure from the norms that govern scholarly inquiry, whereas studying philosophy requires conformation to these norms.","D":"Doing philosophy requires students to challenge the ideas articulated by past philosophers, especially when these ideas are broadly accepted by other people studying philosophy."}'::jsonb, NULL, 'A', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '2-9', 9, 'mcq', 'Archaeologist Weiwei Wang and her colleagues analyzed footed grinding slabs and other food-preparation tools excavated from Oc Eo, a Southeast Asian port city that flourished between the first and sixth centuries CE. Wang and colleagues recovered microscopic remnants of turmeric and other spices from the surfaces of the tools. Turmeric is native to South Asia, more than a thousand miles west of Oc Eo, and the researchers showed that the footed grinding slabs at Oc Eo are very similar to footed grinding slabs common throughout South Asia from around 500 BCE to 300 CE. Wang and colleagues'' findings therefore indicate that there must have been a trade link, whether direct or indirect, between the two regions.', NULL, 'Which finding, if true, would directly weaken the conclusion about Wang and her colleagues'' findings that is presented in the text?', '{"A":"Other types of artifacts originating in South Asia and dating to the first through sixth centuries CE have been found throughout Southeast Asia.","B":"In the first through third centuries CE, there was a significant migration of people from South Asia to Southeast Asia.","C":"The people of Oc Eo and several communities in South Asia regularly traded with people in the region that is now the Southeast Asian country of Malaysia no later than the first century CE.","D":"Some of the spices recovered from OC Eo are native to the Maluku Islands, which are located approximately 2,000 miles southeast of OC Eo."}'::jsonb, NULL, 'D', NULL, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '2-10', 10, 'mcq', 'Strontium Isotope Ratios and Corresponding Numerical Ages in the Global Seawater Curve

0.708980 | 6.20
0.709600 | 5.86
0.709620 | 5.40
0.709040 | 4.75
0.709060 | 3.00

The late Hemphilian (Hh) North American Land Mammal Age includes the subdivisions Hh3, 6.8 million years ago (Ma) to 6 Ma, and Hh4, 6 Ma to 4.75 Ma. While mammalian fossils have indicated that Florida''s Montbrook Fossil Site (MFS) and Palmetto Fauna of the Bone Valley Region (PFBV) date to Hh4, a more precise determination of the sites'' ages has proved challenging. Stephanie R.Killingsworth et al. compared average ratios of strontium-87 to strontium-86 (⁸⁷Sr/⁸⁶Sr) in fossil shark teeth from MFS and PFBV — 0.709000 and 0.709028, respectively — to ⁸⁷Sr/⁸⁶Sr ratios in the global strontium seawater curve, a record that shows how ⁸⁷Sr/⁸⁶Sr ratios in seawater correspond to numerical ages and that is used to date fossils. The researchers concluded that ______', NULL, 'Which choice most effectively uses data from the table to complete the statement?', '{"A":"mammalian fossil evidence offers less dating precision than do ⁸⁷Sr/⁸⁶Sr ratios in fossil shark teeth and that PFBV likely was deposited closer to the Hh3-Hh4 boundary than was MFS.","B":"the average ⁸⁷Sr/⁸⁶Sr ratios in the fossil shark teeth from MFS and PFBV resolve previous uncertainty about the sites'' relative ages by indicating that both sites were deposited contemporaneously during the late Hh.","C":"the average ⁸⁷Sr/⁸⁶Sr ratios in the fossil shark teeth from MFS and PFBV only partially support the site age estimates previously established through mammalian fossil evidence.","D":"the average ⁸⁷Sr/⁸⁶Sr ratios in the fossil shark teeth from MFS and PFBV corroborate that both MFS and PFBV fall within Hh4 but suggest that PFBV was likely deposited more recently than MFS."}'::jsonb, NULL, 'D', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '2-11', 11, 'mcq', 'Researchers used anonymized location data from the US and Côte d''Ivoire to document people''s daily patterns of mobility, using these results to test the efficacy of the researchers'' predictive computer model. In each country, unidirectional cycles among two, three, or four locations were empirically the most common pattern types; the graph shows each of these pattern types as a proportion of all pattern instances found for that country (e.g., the measured value for CI 3 in the graph, 0.12, indicates that the three-location pattern constituted 12% of all pattern instances in the Côte d''Ivoire data). The researchers ran their model twice under different assumptions, concluding that emphasizing the salience of local population density over personal preferences generally yielded the best results.', NULL, 'Which choice most effectively uses data from the graph to illustrate the researchers'' conclusion?', '{"A":"Under the assumption that density is more salient than preferences, the US 2 and CI 2 proportions are approximately 0.65 and 0.85, respectively, significantly higher than the values predicted under the other assumption and thus farther from those predictions from the measured values.","B":"Under the assumption that preferences are more salient than density, the two-location patterns (US 2 and CI 2) were projected to be most frequent in the data even though neither proportion was projected to exceed 0.5, well below the proportion predicted under the other assumption.","C":"Under the assumption that preferences are more salient than density, the US 2 and CI 2 proportions were predicted to be in the range of 0.3 to 0.5, placing them farther from the measured values than those predicted under the other assumption.","D":"Under the assumption that preferences are more salient than density, the US 2 and CI 2 proportions were predicted to be approximately 0.45 and 0.35, respectively; both near the measured values, whereas under the other Assumption, the model overestimated the proportion for US 2 and overestimated that for CI 2."}'::jsonb, NULL, 'C', NULL, NULL, 40)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '2-12', 12, 'mcq', 'Last-mile delivery refers to the final step in delivering packages to customers—and this final step can be very difficult. Delivery companies are contending with the increasing popularity of next-day delivery and with the increasing volume of parcels to be delivered, resulting in a growing bottleneck of packages in the last-mile delivery stage. These companies have been experimenting with innovative solutions in last-mile delivery, including self-service lockers (containers where consumers can pick up their parcels using a unique code). Unfortunately, many of these innovations create new obstacles (e.g., convenient placement of selfservice lockers is challenging) and are not ready for full-scale implementation. As a result, delivery companies will likely ______', NULL, 'Which choice most logically completes the text?', '{"A":"encourage consumers to expect next-day delivery only for products that are widely available.","B":"continue to struggle with last-mile delivery operations until viable solutions become available.","C":"be able to meet consumer''s expectations for next-day delivery in many areas but not in all regions.","D":"have little incentive to find a solution to last-mile delivery challenges."}'::jsonb, NULL, 'B', NULL, NULL, 41)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '2-13', 13, 'mcq', 'Across brown bears—omnivores with high dietary plasticity—there is wide variety in dietary mix, which may reflect genetics, local resource availability, or social learning (cubs stay with their mothers for two years or more). Evaluating these possibilities, Anne Hertel et al. analyzed 30 years of data on trophic position (indicative of dietary mix) for female brown bears. After separation, daughters, who tended to settle near their mothers, occupied the same trophic positions as their mothers for two years, but the correlation disappeared by year five. Trophic correlation with unrelated individuals in similar habitats was modest, while habitat-independent correlation with nonmaternal relatives (e.g., cousins) was no different than with unrelated individuals. These findings suggest that ______', NULL, 'Which choice most logically completes the text?', '{"A":"social learning and resource fluctuations may both play a role in dietary mix among females, at least temporarily, though genetic factors appear to make a significant contribution as well.","B":"female dietary mix is best understood as changeable and contingent on fluctuating environmental conditions rather than as the result of social learning or genetic factors.","C":"dietary mix among females may reflect a social learning effect that eventually diminishes, though environmental constraints cannot be ruled out as a contributing factor.","D":"dietary similarity among female brown bears is likely driven primarily by social learning during early independence but fades quickly as individual foraging habits develop."}'::jsonb, NULL, 'C', NULL, NULL, 42)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '2-14', 14, 'mcq', 'The parks of Los Angeles, California, seem to be making people happier. In a 2022 study, researchers studying connections between the physical location in which a social media post was created and ______ contents analyzed geotagged social media posts from Los Angeles. They found that posts from the city''s parks contained more words associated with happiness than other posts did.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"they''re","B":"it''s","C":"their","D":"its"}'::jsonb, NULL, 'D', NULL, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '2-15', 15, 'mcq', 'On April 12, 1985, the space shuttle Discovery blasted off into space, commencing Mission ______. six days and twenty-three hours, the mission ended when the shuttle landed at Kennedy Space Center in Florida.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"STS-51-D, it lasted","B":"STS-51-D, lasting","C":"STS-51-D lasting","D":"STS-51-D. Lasting"}'::jsonb, NULL, 'D', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '2-16', 16, 'mcq', 'Now seen as a mechanical precursor to the e-reader, Spanish educator and inventor Angela Ruiz Robles''s Enciclopedia Mecánica eschewed pages in favor of three horizontal paper scrolls that could be easily swapped out to accommodate a range of subjects. Though Ruiz Robles''s prototype had limited functionality, interactive features described in her 1949 patent—such as a button labeled "verb" that would illuminate relevant text when pressed — ______ an impressive early vision of hypertext.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"revealing","B":"reveal","C":"reveals","D":"has revealed"}'::jsonb, NULL, 'B', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '2-17', 17, 'mcq', 'Jane Austen''s Northanger Abbey (1818) is considered a satire of another novel popular at the time: Ann Radcliffe''s The Mysteries of Udolpho (1794), which Austen''s heroine, Catherine Morland, is depicted reading. However, the similarity of the ______ experiences—the predicaments of both Catherine and Radcliffe''s Emily St. Aubert result from men''s greed—suggests that underlying the satire is a social critique.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"novel''s protagonists''","B":"novels'' protagonists","C":"novels'' protagonists''","D":"novel''s protagonist''s"}'::jsonb, NULL, 'C', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '2-18', 18, 'mcq', 'Roger Angell''s reputation as one of the greatest baseball writers of all ______ bolstered by dozens of New Yorker essays in which he demonstrated a deep affection for and knowledge of the game, has perhaps overshadowed his remarkable career as a fiction editor: during his decades-long tenure at the New Yorker, Angell helped shape the work of John Updike, Ann Beattie, and other contributors of note.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"time was","B":"time,","C":"time had been","D":"time, was"}'::jsonb, NULL, 'B', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '2-19', 19, 'mcq', 'Before the ratification of the 19th Amendment in 1920, many US territories extended voting rights to women, in part to spur westward migration that would help these territories meet population thresholds for statehood. The Territory of Wyoming approved women''s suffrage in 1869 before attaining statehood in ______ while eastern states, lacking the same incentive, did not follow suit until after the turn of the century.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"1890, for example;","B":"1890, for example,","C":"1890; for example,","D":"1890, for example:"}'::jsonb, NULL, 'B', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '2-20', 20, 'mcq', 'The legacy of the Spanish Empire, which once controlled portions of five continents, is evident in Spanish-speaking Panama, one of many places that reveal their imperial history in their language. Contrast Panama with the Netherlands, which ceased to be part of the empire in ______ the latter''s connection to the empire is so attenuated that Spanish is seldom spoken there today.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"1648 and","B":"1648:","C":"1648,","D":"1648"}'::jsonb, NULL, 'B', NULL, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '2-21', 21, 'mcq', 'To determine the approximate age of stone tools excavated from ancient lake beds in Saudi Arabia, archaeologist Eleanor Scerri and colleagues collected samples of sediments surrounding the tools; these samples were then analyzed using a method known as optically stimulated luminescence (OSL) dating. ______ OSL dating indicated that the tools were around 400,000 years old.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"In addition,","B":"By comparison,","C":"Similarly,","D":"Ultimately,"}'::jsonb, NULL, 'D', NULL, NULL, 50)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '2-22', 22, 'mcq', 'The moon Lysithea orbits Jupiter in the same direction that the planet rotates. ______ Lysithea''s orbit is described as prograde. Mneme, another of Jupiter''s moons, orbits in the opposite direction, so its orbit is described with the opposite term: retrograde.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Likewise,","B":"Next,","C":"Thus,","D":"However,"}'::jsonb, NULL, 'C', NULL, NULL, 51)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '2-23', 23, 'mcq', 'Macarena Garcia Marin is a space scientist who works on the James Webb Space Telescope, or JWST. Thanks in part to Garcia Marin''s contributions, the telescope is now positioned near the Sun-Earth L2 Lagrange point, almost one million miles beyond Earth''s orbit. ______ the JWST''s predecessor, the Hubble Telescope, is only about 340 miles above Earth''s surface.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Similarly,","B":"Secondly,","C":"By contrast,","D":"Therefore,"}'::jsonb, NULL, 'C', NULL, NULL, 52)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '2-24', 24, 'mcq', 'The Austronesian language of Nauruan has only about 10,300 living speakers. Although most Nauruan speakers live in Nauru, where the language originated, Nauruan is also spoken in New York City. ______ the New York-based Endangered Language Alliance has identified a group of Nauruan speakers in the city''s Murray Hill neighborhood, in the borough of Manhattan.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Nonetheless,","B":"In addition,","C":"Meanwhile,","D":"Specifically,"}'::jsonb, NULL, 'D', NULL, NULL, 53)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '2-25', 25, 'mcq', 'Nineteenth-century Modernista architects championed nature in their designs. Granted, the wavy stone façade and ornate floral tilework of Casa Batlló, a Modernista private home designed by Antoni Gaudí, couldn''t exactly grow in a forest — one sees natural influences in Gaudí''s penchant for curves (rather than right angles) and plant- and animal-inspired flourishes.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Furthermore,","B":"Similarly,","C":"Still,","D":"In other words,"}'::jsonb, NULL, 'C', NULL, NULL, 54)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '2-26', 26, 'mcq', 'While researching a topic, a student has taken the following notes:
• The A.M. Turing Award is a prestigious award given by the Association for Computing Machinery (ACM).
• The ACM gives the award for "major contributions of lasting importance to computing."
• It is named after groundbreaking British mathematician Alan Turing.
• Barbara Liskov won the award in 2008.', NULL, 'The student wants to explain whom the award is named for and identify one recipient of it. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"In 2008, Barbara Liskov won the A.M. Turing Award, which is given for \"major contributions of lasting importance to computing.\"","B":"The A.M. Turing Award, which is named for British mathematician Alan Turing, was given to Barbara Liskov in 2008.","C":"The A.M. Turing Award is given for \"major contributions of lasting importance to computing.\"","D":"It was in 2008 that Barbara Liskov won the A.M. Turing Award."}'::jsonb, NULL, 'B', NULL, NULL, 55)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '2-27', 27, 'mcq', 'While researching a topic, a student has taken the following notes:
• When the electrons of a chemical element change energy states, certain wavelengths of light are released.
• This unique collection of wavelengths is known as the emission spectrum of the element.
• Titanium''s emission spectrum includes the 430.5 nanometer (nm) wavelength.
• Krypton''s emission spectrum includes the 583.2 nm wavelength.
• The violet portion of the visible spectrum is made up of light with wavelengths of 380–450 nm.', NULL, 'The student wants to identify an emission spectrum that includes a wavelength in the violet portion of the visible spectrum. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"The 583.2 nm wavelength, which is in the violet portion of the visible spectrum, is one wavelength in the emission spectrum of krypton.","B":"Since the 430.5 nm wavelength of light is within the 380–450 nm range, it is part of the violet portion of the visible spectrum.","C":"Containing the 430.5 nm and 583.2 nm wavelengths, respectively, both titanium''s and krypton''s emission spectra include wavelengths in the violet portion of the visible spectrum.","D":"Titanium''s emission spectrum includes the 430.5 nm wavelength, which is in the violet portion of the visible spectrum."}'::jsonb, NULL, 'D', NULL, NULL, 56)
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
  VALUES (v_mod, 1, '3-1', 1, 'mcq', 'graph: decreasing line; x-axis labeled "Time (hours)" 0–14, y-axis labeled "Weight (ounces)" 0–14; line starts near (0,14) and decreases to approximately (14,8)', NULL, 'The function w models the weight, in ounces, of the remaining solid wax of a burning candle as a function of the time x, in hours, after the candle was lit. The graph of y = w(x) is shown. According to the model, what was the weight, in ounces, of the candle''s remaining solid wax 12 hours after the candle was lit?', '{"A":"4","B":"8","C":"10","D":"13"}'::jsonb, NULL, 'C', NULL, NULL, 3)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '3-2', 2, 'mcq', NULL, NULL, 'In triangle ABC, the sum of the measures of angle A and angle B is 159.5°. What is the measure of angle C?', '{"A":"20.5°","B":"90°","C":"110.5°","D":"180°"}'::jsonb, NULL, 'A', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '3-3', 3, 'mcq', NULL, NULL, 'A local gym is offering a 25% discount on an annual membership. The regular cost of an annual membership is $288. How much less is the discounted cost of the membership than the regular cost of the membership?', '{"A":"$25","B":"$72","C":"$216","D":"$288"}'::jsonb, NULL, 'B', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '3-4', 4, 'mcq', 'table: x | y; 0 | 8; 1 | 9; 2 | 10', NULL, 'The table shows three values of x and their corresponding values of y. There is a linear relationship between x and y. Which of the following equations represents this relationship?', '{"A":"y = 8x","B":"y = 10x + 2","C":"y = 10x","D":"y = x + 8"}'::jsonb, NULL, 'D', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '3-5', 5, 'grid', NULL, NULL, 'The function f is defined by the equation f(x) = 380x. What is the value of f(10)?', NULL, NULL, '3800', '["3800"]'::jsonb, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '3-6', 6, 'mcq', NULL, NULL, 'Which of the following equations has solutions 13 and -24?', '{"A":"(x - 24)(x + 13) = 0","B":"(x - 13)(x + 24) = 0","C":"(x + 13)(x + 24) = 0","D":"(x - 24)(x - 13) = 0"}'::jsonb, NULL, 'B', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '3-7', 7, 'mcq', 'equations: y = 0; y = 4(x^2 - 36)', NULL, 'Which ordered pair (x, y) is a solution to the given system of equations?', '{"A":"(0, 6)","B":"(0, 36)","C":"(6, 0)","D":"(36, 0)"}'::jsonb, NULL, 'C', NULL, NULL, 9)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '3-8', 8, 'mcq', NULL, NULL, 'When a scientist began observing a sample of an isotope, the mass of the sample was 530,000 milligrams. The mass of the sample decreases by half approximately every 5 days. Which of the following is closest to the mass, in milligrams, of the sample 35 days after the scientist began observing the sample?', '{"A":"4141","B":"15143","C":"16563","D":"75714"}'::jsonb, NULL, 'A', NULL, NULL, 10)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '3-9', 9, 'mcq', NULL, NULL, 'The height of a right circular cylinder is 31 inches, and the circumference of its base is 310 inches. Which expression represents the total surface area, in square inches, of the cylinder?', '{"A":"(31)(310)","B":"pi*(155/pi)^2*(31)","C":"(31)(310) + pi*(155/pi)^2","D":"(31)(310) + 2*pi*(155/pi)^2"}'::jsonb, NULL, 'D', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '3-10', 10, 'mcq', NULL, NULL, 'The function f(w) = 6w^2 gives the area of a rectangle, in square feet ft^2, if its width is w ft and its length is 6 times its width. Which of the following is the best interpretation of f(13) = 1,014?', '{"A":"If the width of the rectangle is 13 ft, then the area of the rectangle is 1,014 ft^2.","B":"If the width of the rectangle is 13 ft, then the length of the rectangle is 1,014 ft.","C":"If the width of the rectangle is 1,014 % then the length of the rectangle is 13 ft.","D":"If the width of the rectangle is 1,014 ft, then the area of the rectangle is 13 ft^2."}'::jsonb, NULL, 'A', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '3-11', 11, 'grid', NULL, NULL, 'The expression (3x + 5)(8x - 7) can be written in the form ax^2 + bx + c, where a, b, and c are constants. What is the value of a + b?', NULL, NULL, '43', '["43"]'::jsonb, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '3-12', 12, 'grid', NULL, NULL, 'The ratio a to b is equivalent to the ratio 49 to 26. What is the value of a when b = 182?', NULL, NULL, '343', '["343"]'::jsonb, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '3-13', 13, 'mcq', NULL, NULL, 'At the beginning of the year, Imani has $170 in her account. Each month this year, she will deposit between $30 and $60 into the account. Which inequality represents all possibilities for the total amount of money x, in dollars, in Imani''s account after 10 months of deposits this year?', '{"A":"x <= 300","B":"x >= 600","C":"170 <= x <= 620","D":"470 <= x <= 770"}'::jsonb, NULL, 'D', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '3-14', 14, 'mcq', NULL, NULL, 'The function f is defined by f(x) = x^3 - 2x^2 - 8x + 48. In the xy-plane, the graph of y = h(x) is the result of translating the graph of y = f(x) up 6 units. What is the y-coordinate of the y-intercept of the graph of y = h(x)?', '{"A":"54","B":"48","C":"6","D":"0"}'::jsonb, NULL, 'A', NULL, NULL, 16)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '3-15', 15, 'grid', NULL, NULL, 'A circle has a circumference of 28*pi centimeters. What is the diameter, in centimeters, of the circle?', NULL, NULL, '28', '["28"]'::jsonb, NULL, 17)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '3-16', 16, 'mcq', NULL, NULL, 'How many solutions does the equation 35x - 25 = 5(7x - 5) have?', '{"A":"Exactly one","B":"Exactly two","C":"Infinitely many","D":"Zero"}'::jsonb, NULL, 'C', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '3-17', 17, 'mcq', NULL, NULL, 'On January 1, 2000, the population of a town was 26,257 and on January 1, 2010, the population was 26,858. The equation 10x + 26,257 = 26,858 describes this situation. Which of the following is the best interpretation of x in this context?', '{"A":"The total increase in population between 2000 and 2010","B":"The projected population of the town 10 years after 2010","C":"The average increase per year of the population between 2000 and 2010","D":"The percentage by which the population of the town increased each year between 2000 and 2010"}'::jsonb, NULL, 'C', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '3-18', 18, 'mcq', NULL, NULL, 'For the linear function f, f(-5) = -7, and the slope of the graph of y = f(x) in the xy-plane is 3. Which equation defines f?', '{"A":"f(x) = 3x + 8","B":"f(x) = 3x - 5","C":"f(x) = 3x - 7","D":"f(x) = 3x - 12"}'::jsonb, NULL, 'A', NULL, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '3-19', 19, 'mcq', NULL, NULL, 'In the xy-plane, an equation of circle A is (x - 2)^2 + (y - 7)^2 = 25. Circle B has the same center as circle A but has a radius that is twice the radius of circle A. Which equation represents circle B?', '{"A":"(x - 2)^2 + (y - 7)^2 = 50","B":"(x - 2)^2 + (y - 7)^2 = 100","C":"(x - 2)^2 + (y - 7)^2 = 250","D":"(x - 2)^2 + (y - 7)^2 = 625"}'::jsonb, NULL, 'B', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '3-20', 20, 'grid', NULL, NULL, 'Line k contains the points (-3, -60), (v, 0), and (5, 76). What is the value of v?', NULL, NULL, '9/17', '["9/17"]'::jsonb, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '3-21', 21, 'mcq', 'Right triangle FGH with right angle at H. Angle G = 60°. Side FG (hypotenuse) = 68. Note: Figure not drawn to scale.', NULL, 'In right triangle FGH shown, what is the value of cos F?', '{"A":"sqrt(3)/68","B":"1/2","C":"sqrt(3)/2","D":"34*sqrt(3)"}'::jsonb, NULL, 'C', NULL, NULL, 23)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '3-22', 22, 'mcq', NULL, NULL, 'Based on a model, on day 1 of an 8-day experiment, a lima bean plant had an estimated mass of 253 grams, and each day after day 1 of the experiment, the estimated mass of the plant decreased by 4 grams. Which equation represents this model, where m is the estimated mass, in grams, of the plant on day x of the experiment and 1 <= x <= 8?', '{"A":"m = -4x + 245","B":"m = -4x + 249","C":"m = -4x + 253","D":"m = -4x + 257"}'::jsonb, NULL, 'D', NULL, NULL, 24)
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
  VALUES (v_mod, 1, '4-1', 1, 'mcq', NULL, NULL, 'A cable company charges new customers a onetime installation fee and a monthly service fee for cable service. The equation y = 50x + 120 gives the total amount y, in dollars, the cable company charges new customers for x months of cable service. What is the amount, in dollars, of the onetime installation fee the cable company charges new customers?', '{"A":"170","B":"120","C":"70","D":"0"}'::jsonb, NULL, 'B', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '4-2', 2, 'mcq', 'Data set X: 13, 16, 19, 21, 24, 25, 25, 26, 38
Data set Y: 13, 16, 19, 21, 24, 25, 25, 26, 33
Data set Y is created by replacing the number 38 in data set X with the number 33.', NULL, 'Which of the following statements is true about the means and medians of data set X and data set Y?', '{"A":"The mean of data set X is greater than the mean of data set Y, and the median of data set X equals the median of data set Y.","B":"The mean of data set X is greater than the mean of data set Y, and the median of data set X is greater than the median of data set Y.","C":"The mean of data set X equals the mean of data set Y, and the median of data set X equals the median of data set Y.","D":"The mean of data set X is less than the mean of data set Y, and the median of data set X is greater than the median of data set Y."}'::jsonb, NULL, 'A', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '4-3', 3, 'mcq', 'y = 4x + 36', NULL, 'One of the two equations in a system of linear equations is given. The system has infinitely many solutions. Which equation could be the second equation in this system?', '{"A":"y - 4x = -36","B":"y - 4x = 36","C":"y - 9x = 18","D":"y - 9x = 0"}'::jsonb, NULL, 'B', NULL, NULL, 29)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '4-4', 4, 'grid', NULL, NULL, 'If x + 3y = 29 and 7x - 12y = -61, what is the value of y?', NULL, NULL, '8', '["8"]'::jsonb, NULL, 30)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '4-5', 5, 'mcq', 'R = 0.36*l/A', NULL, 'The given equation relates the resistance R, in ohms, of a wire to its length l, in meters, and its cross-sectional area A, in square meters. Which equation correctly expresses the length, in meters, of the wire in terms of its resistance, in ohms, and its cross-sectional area, in square meters?', '{"A":"l = (R - A)/0.36","B":"l = (R + A)/0.36","C":"l = 0.36*R/A","D":"l = A*R/0.36"}'::jsonb, NULL, 'D', NULL, NULL, 31)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '4-6', 6, 'mcq', NULL, NULL, 'For the polynomial function f, the graph of y = f(x) in the xy-plane passes through the points (-5, 0), (3, 0), and (7, 0). Which of the following must be a factor of f(x)?', '{"A":"x + 3","B":"x + 7","C":"x - 3","D":"x - 5"}'::jsonb, NULL, 'C', NULL, NULL, 32)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '4-7', 7, 'mcq', NULL, NULL, 'Which shaded region represents the solutions to the inequality 4x - 5y < 9?', '{"A":"Graph with xy-plane axes ranging roughly -10 to 10; a line with positive slope; shading above-left of the line","B":"Graph with xy-plane axes ranging roughly -10 to 10; a line with positive slope; shading below-right of the line","C":"Graph with xy-plane axes ranging roughly -10 to 10; a line with positive slope; shading below-left of the line","D":"Graph with xy-plane axes ranging roughly -10 to 10; a line with positive slope; shading above-right of the line"}'::jsonb, NULL, 'A', NULL, NULL, 33)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '4-8', 8, 'grid', NULL, NULL, 'In the xy-plane, line k has a slope of 6/13, an x-intercept of (-6, 0), and a y-intercept of (0, p). What is the value of p?', NULL, NULL, '36/13', '["36/13"]'::jsonb, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '4-9', 9, 'mcq', NULL, NULL, 'The measure of angle S is 8*pi/11 radians. The measure of angle T is 2 times the measure of angle S. Which expression represents the measure, in degrees, of angle T?', '{"A":"(8/11)(90)(2)","B":"(8/11)(180)(2)","C":"(8/(11*pi))(90)(2)","D":"(8*pi/11)(180)(2)"}'::jsonb, NULL, 'B', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '4-10', 10, 'mcq', NULL, NULL, 'What is the x-intercept of the graph of y = (45 - x)/(ax + b) in the xy-plane, where a and b are positive constants?', '{"A":"(-b/a, 0)","B":"(0, 45/b)","C":"(0, -45)","D":"(45, 0)"}'::jsonb, NULL, 'D', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '4-11', 11, 'mcq', NULL, NULL, 'The ratio x to y is equivalent to the ratio 4 to 7. If x = 11t, what is the value of y in terms of t?', '{"A":"(4/77)t","B":"(7/44)t","C":"(44/7)t","D":"(77/4)t"}'::jsonb, NULL, 'D', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '4-12', 12, 'mcq', NULL, NULL, 'A research manager selected 2 random samples of ovens of a certain type to estimate the average amount of time this type of oven takes to preheat to 350 degrees Fahrenheit (°F). The research manager recorded the amount of time, in minutes, each oven takes to preheat to 350°F. Based on the first sample, the research manager estimated that this type of oven takes an average of 14.2 minutes to preheat to 350°F, with an associated margin of error of 1 minute. Based on the second sample, the research manager estimated that this type of oven takes an average of 14.4 minutes to preheat to 350°F, with an associated margin of error of 2.2 minutes. Assuming the margins of error were calculated the same way, which of the following best explains why the first sample obtained a smaller margin of error than the second sample?', '{"A":"The first sample contained fewer ovens than the second sample.","B":"The first sample contained more ovens than the second sample.","C":"The first sample took less time on average to preheat to 350°F than the second sample.","D":"The first sample took more time on average to preheat to 350°F than the second sample."}'::jsonb, NULL, 'B', NULL, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '4-13', 13, 'mcq', 'f(x) = 231(1.20)^(x/4)', NULL, 'For the given function f, the value of f(x) increases by p% for every increase of x by 8. What is the value of p?', '{"A":"20","B":"31","C":"40","D":"44"}'::jsonb, NULL, 'D', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '4-14', 14, 'mcq', NULL, NULL, 'A model estimates that in a particular forest, the number of trees with any given diameter measured at shoulder height is 21% less for each 1-inch increase in tree diameter measured at shoulder height. The model can be written in the form f(x) = a*b^x, where a and b are constants and x is the tree''s diameter, in inches, measured at shoulder height, and x >= 5. The model estimates that 3,100 trees in this forest have a diameter of 13 inches measured at shoulder height. Which function best represents this model?', '{"A":"f(x) = 3,100 * 1.21^x","B":"f(x) = 3,100 * 0.79^x","C":"f(x) = 66,0000 * 1.21^x","D":"f(x) = 66,0000 * 0.79^x"}'::jsonb, NULL, 'D', NULL, NULL, 40)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '4-15', 15, 'mcq', 'Scatterplot showing relationship between two variables t (horizontal axis, ranging from 230 to 270) and d (vertical axis, ranging from 245 to 525). Data points show a positive linear trend. A line of best fit is drawn through the points.', NULL, 'The scatterplot shows the relationship between two variables, t and d. Which of the following equations is the most appropriate linear model for the data shown?', '{"A":"d = -60.1 + 2.02t","B":"d = 160.1 + 2.02t","C":"d = 359.8 + 2.02t","D":"d = 394.8 + 2.02t"}'::jsonb, NULL, 'A', NULL, NULL, 41)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '4-16', 16, 'mcq', NULL, NULL, 'The function f is defined by f(x) = a^x - b, where a and b are constants. In the xy-plane, the graph of y = f(x) passes through the points (c, 11) and (2c, 221) where c is a constant. Which of the following could be the value of b?', '{"A":"4","B":"25","C":"210","D":"232"}'::jsonb, NULL, 'A', NULL, NULL, 42)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '4-17', 17, 'grid', NULL, NULL, 'The price of an item increased by p% from $90 to $93. What is the value of p?', NULL, NULL, '10/3', '["10/3"]'::jsonb, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '4-18', 18, 'mcq', NULL, NULL, 'In triangle ABC, the measure of angle A is 56° and AC = 30. In triangle PQR, the measure of angle P is 56° and PR = 90. Which additional piece of information is sufficient to prove that triangle ABC is similar to triangle PQR?', '{"A":"AB = 20 and PQ = 20.","B":"AB = 20 and QR = 60.","C":"The measures of angle B and angle R are 48° and 76°, respectively.","D":"The measures of angle B and angle Q are 56° and 48°, respectively."}'::jsonb, NULL, 'C', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '4-19', 19, 'grid', NULL, NULL, '(4/9)(4x + 9)(x + sqrt(4k + 9))(x - sqrt(4k + 9)) = 0

In the given equation, k is a positive constant. The product of the solutions to the equation is 81. What is the value of k?', NULL, NULL, '27/4', '["27/4"]'::jsonb, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '4-20', 20, 'mcq', NULL, NULL, '4x^2 - px + w = -86

In the given equation, p and w are integer constants. The equation has exactly one real solution. Which is NOT a possible value of w?', '{"A":"-22","B":"14","C":"25","D":"314"}'::jsonb, NULL, 'C', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '4-21', 21, 'mcq', NULL, NULL, 'If (x + 6)/5 = (x + 6)/13, the value of x + 6 is between which of the following pairs of values?', '{"A":"-7 and -5","B":"-2 and 2","C":"2 and 7","D":"8 and 13"}'::jsonb, NULL, 'B', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '4-22', 22, 'grid', NULL, NULL, 'The expression 6x^4 + 17x^2 + 5 can be rewritten as (3x^2 + a)(2x^2 + b), where a and b are positive integers, or as (3x^2 + c)(2x^2 + d), where c and d are positive nonintegers. What is the value of a + c?', NULL, NULL, '17/2', '["17/2"]'::jsonb, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
END $seed$;
