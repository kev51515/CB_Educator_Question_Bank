-- =============================================================================
-- Migration: 0115_seed_dsat_june_2026_asia.sql
-- Purpose:   Seed "Test #2 — Digital SAT, June 2026 (Asia-Pacific)" — Reading &
--            Writing only (2 timed modules x 27 = 54 questions) into the
--            full-test tables from 0048.
--
--   Source:  pdf/2026-June-Asia.pdf (Witry Education reconstruction, Form A).
--            Image-only PDF (no text layer); questions OCR'd from page renders,
--            answer key triple-verified (manual read + transcription agents +
--            independent second model). All data tables/graphs are transcribed
--            into the passage as text, so NO web-served figure assets exist.
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
  VALUES ('dsat-june-2026-asia', 2, 'Test #2 — Digital SAT, June 2026 (Asia-Pacific)', 'DSAT Jun 2026 Asia', '2026-June-Asia.pdf', 54)
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
  VALUES (v_mod, 1, '1-1', 1, 'mcq', 'The following text is from the 1996 novel Desert Birds by Elena Ruiz. A young girl is sitting in a room with her grandmother, Teresa, whose old rocking chair had previously been kept on the porch. The girl took comfort in the mere presence of the chair in the room. Comfort in its movement. It was faded by years in the sun and bent by occasional rain, and only in the last few months had Teresa decided to bring it inside with the family.', NULL, 'As used in the text, what does the phrase “mere presence of the chair” most nearly refer to?', '{"A":"The chair''s relative simplicity compared with the rest of the furniture","B":"The simple fact of the chair''s existence","C":"The chair''s lack of appeal to the rest of the family","D":"The idea that the chair is unnoticeable"}'::jsonb, NULL, 'B', NULL, NULL, 3)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '1-2', 2, 'mcq', 'In the 1980s, Australian diners initially ______ major fast food chains from the United States. However, marketing strategies such as free soft drinks and low prices gradually drew in customers looking for convenient meals. By the late 1990s, public opinion had changed as fast food shifted from a debuted novelty to a familiar part of Australia''s dining.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"prepared","B":"resisted","C":"discovered","D":"reflected"}'::jsonb, NULL, 'B', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '1-3', 3, 'mcq', 'The Cuban Revolution (1953-1959) was followed by a period of flourishing literary production, with writers such as Nicolás Guillén contributing to the ______ of poetry, fiction, essays, and more. Unfortunately, this flood of interesting writing has diverted scholarly attention from the equally fascinating work of nineteenth-century figures like Gertrudis Gómez de A.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"overturning","B":"abundance","C":"erasure","D":"underappreciation"}'::jsonb, NULL, 'B', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '1-4', 4, 'mcq', 'Solar physicists studying the Sun have identified an important ______ between magnetically active and relatively quiet regions. In active regions, bursts of ultraviolet light usually come before substantial decreases in magnetic energy, whereas in quiet regions, ultraviolet light intensity and magnetic energy remain continuously correlated without notable energy drops.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"interaction","B":"disparity","C":"trade-off","D":"analogy"}'::jsonb, NULL, 'B', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '1-5', 5, 'mcq', 'In 1903, Mary Anderson patented a device that cleared rain and snow from a car''s windshield, improving visibility for drivers. In 1886, Josephine Cochrane invented a machine that washed dishes more efficiently, easing a time-consuming household task. Although designed to solve different problems, both inventions have had lasting effects. Likewise, both inventors exemplified important traits that continue to drive innovation: creative thinking, strong problem-solving skills, and persistence.', NULL, 'Which choice best describes the function of the underlined portion in the text as a whole?', '{"A":"It lists some specific impacts that two older inventions have had on modern life.","B":"It lists qualities that Anderson and Cochrane shared and that many inventors rely on.","C":"It lists characteristics that the text says are frequently mentioned in studies of modern inventors.","D":"It lists the features of Anderson''s and Cochrane''s inventions that contributed most to their usefulness."}'::jsonb, NULL, 'B', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '1-6', 6, 'mcq', 'Sellers and advertisers often use prices ending in 9 (for example, $7.99) to make items seem like a better value. In many cases, shoppers respond as intended, viewing such prices as signs of a discount or special offer. However, studies have found that some consumers connect these prices with lower-quality goods and even see them as misleading—an attempt to make a $7.99 item seem like it costs $7 rather than $8, which is closer to the truth.', NULL, 'Which choice best describes the function of the underlined sentence in the text as a whole?', '{"A":"It describes a contrast between how sellers want prices ending in 9 to be understood and how consumers generally understand them.","B":"It points out unexpected ways some consumers interpret prices ending in 9, suggesting that this pricing strategy may not be effective in every case.","C":"It explains the negative reactions to prices ending in 9 that have caused some businesses to change their pricing methods.","D":"It identifies how consumers usually react to prices ending in 9 while acknowledging that some consumers react differently."}'::jsonb, NULL, 'B', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '1-7', 7, 'mcq', 'The following text is from Frances Burney''s 1784 satirical play “The Busy Salon.” Clara, Lady Venom, and Edward Fairman are discussing their mutual acquaintance Lord Arthur Sharp.
CLARA: [Lord Arthur] has done nothing—but his talk is a perpetual slander on all his acquaintances.
FAIRMAN: Aye, and the worst of it is there is no advantage in not knowing him, for he''ll abuse a stranger just as soon as his closest friend—and this concerns us all.
LADY VENOM: But say you, Mr. Fairman?
FAIRMAN: Certainly, madam, to smile at the jest that leaves a wound in another''s heart is to become a principal in the mischief.', NULL, 'Which choice best describes the function of the underlined sentence in the text as a whole?', '{"A":"It illustrates and expands on one character''s definition of a term that was discussed earlier in the text.","B":"It appears to offer an explanation for the behavior of the character who is the topic of conversation in the text.","C":"It contrasts the point of view of one character with that of another through the use of figurative methods.","D":"It presents a position that seems to support the stance of one character and undermine that of another."}'::jsonb, NULL, 'D', NULL, NULL, 9)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '1-8', 8, 'mcq', 'Common chickweed is a weed found across North America. Although gardeners and farmers often consider common chickweed a nuisance, weeds like it can offer certain advantages. For instance, they may help reduce soil erosion.', NULL, 'Which choice best states the main idea of the text?', '{"A":"Removing weeds is an enjoyable chore.","B":"Some weeds can be useful.","C":"Certain gardening methods can lead to more weeds.","D":"North America is home to many plant species."}'::jsonb, NULL, 'B', NULL, NULL, 10)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '1-9', 9, 'mcq', 'Division of labor is a system in which the work of making a product is split among different people who each specialize in a particular task. Rather than having one person make the entire product, workers concentrate on just one stage of production. In a backpack factory, for example, some workers cut the fabric, others attach the zippers. Workers become more skilled at their tasks, often to their closest friend—and the individual tasks and save time because they do not have to switch between different kinds of work. This system has played an important role in increasing the amount of goods that can be produced in modern economies.', NULL, 'Which choice best states the main focus of the text?', '{"A":"How factories prepare new employees for their work","B":"The history of the zipper","C":"How division of labor improves efficiency","D":"The future of the backpack industry"}'::jsonb, NULL, 'C', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '1-10', 10, 'mcq', 'The following text is adapted from Beatrix Potter''s 1913 story "Winter in Plue Hollow". The Mole has just been found by a companion after wandering in the forest. Snow is beginning to fall. The Mole looked at the wood that had seemed so frightening to him and saw it in a very different way. Holes, dips, puddles, traps, and other dangers to a traveler were quickly disappearing, and a bright blanket was spreading everywhere, looking too delicate for heavy feet to step on.', NULL, 'Which choice most accurately expresses the main idea of the text?', '{"A":"The Mole prefers warm, dry weather to cold, snowy weather.","B":"As the ground becomes covered in snow, the landscape no longer appears dangerous to the Mole.","C":"After being found by his companion, the Mole feels embarrassed about getting lost.","D":"The Mole is saddened that his time wandering in the forest has ended."}'::jsonb, NULL, 'B', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '1-11', 11, 'mcq', 'Estimated Annual Costs and Profits for Biofuel Profit Models (in dollars) Because biofuels usually produce less carbon than fossil fuels, they can help reduce emissions. In California, biofuel producers have two sources of revenue: biofuel sales and LCFS (low-carbon fuel standard) credits bought from firms by companies whose fuel does not meet the state''s emissions standards. Considering how these revenue streams affect one another, Aylin Karaca et al. studied three models for how a biofuel company might maximize profit: the industry-standard heuristic model, a lexicographic model, and a model proposed by the researchers. They concluded that although their model maximized profit, it might not be the best option for firms that need to minimize cash outflows.
Method | LCFS revenue | Total revenue | Total cost | Total profit
Heuristic | 6,857,474 | 37,957,674 | 30,528,134 | 7,429,540
Lexicographic | 9,878,474 | 40,998,474 | 30,528,134 | 10,470,340
Proposed | 11,157,472 | 42,277,472 | 30,933,069 | 11,344,403', NULL, 'Which statement based on the table best support the researchers'' conclusion?', '{"A":"Both the total revenue and the total profit for the lexicographic model are higher than those for the heuristic model but lower than those for the proposed model.","B":"Although the proposed model''s total profit and LCFS revenue are close in value, the lexicographic model''s total profit is much greater than its LCFS revenue.","C":"Although the proposed model projects the greatest total profit, it also projects a higher total cost than the lexicographic model, which has the same total cost as the heuristic model but a higher total profit.","D":"The proposed model has the highest total revenue, LCFS revenue, and total cost among the three models."}'::jsonb, NULL, 'C', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '1-12', 12, 'mcq', 'First published in 1920, Edith Wharton''s The Age of Innocence takes place in New York in the 1870s. In one scene, Newland Archer goes to the opera. The narrator portrays Archer''s social circle as valuing the familiar more than the new: ______', NULL, 'Which quotation from The Age of Innocence most effectively supports the claim?', '{"A":"It surprised [Newland] that life should be going on in the old way when his own reactions to it had so completely changed.\"","B":"\"Though there was already talk... of a new Opera House which should compete in costliness and splendour with those of the great European capitals, the world of fashion was still content to reassemble every winter in the shabby red and gold boxes of the sociable old Academy [of Music in New York]\"","C":"\"Newland Archer, leaning against the wall at the back of the club box [where his seat was], turned his eyes from the stage and scanned the opposite side of the house\"","D":"\"But, in the first place, New York was a metropolis, and perfectly aware that in metropolises it was ''not the thing'' to arrive early at the opera\""}'::jsonb, NULL, 'B', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '1-13', 13, 'mcq', 'A group of public transit specialists in Portland is claiming a new streetcar stop for the Burnside Corridor Streetcar line that will serve a neighborhood that currently has no stop. To determine where to place the stop, the group is relying on a survey from ten years ago that asked how far neighborhood residents would be willing to walk to reach a streetcar stop. The group also reviewed studies showing that people''s willingness to walk to public transit is directly affected by factors such as weather and the presence of well-enforced free speed limits for cars. A researcher has argued that the survey does not accurately reflect the views of people who live in this neighborhood today.', NULL, 'Which finding, if true, would most directly support the researcher''s claim?', '{"A":"There has been a sharp increase in the last ten years in the number of cyclists using roads in the neighborhood that the streetcar stop will serve.","B":"Residents of Portland are much less likely to use public transit on rainy days than on clear days.","C":"The enforcement of posted speed limits in the neighborhood that the streetcar stop will serve has increased substantially in the last ten years.","D":"Current riders of the Burnside Corridor Streetcar are satisfied with the number of stops along the line."}'::jsonb, NULL, 'C', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '1-14', 14, 'mcq', 'More than 700 languages are spoken in New York City in addition to English—someone might hear Bengali in Kensington or Tibetan in Woodside. Most speakers of Chinese languages live in the neighborhood of Flushing (in New York City''s borough of Queens), where the dominant Chinese language is Mandarin, and in Chinatown, in the borough of Manhattan, where the dominant Chinese languages are Cantonese and Fuzhounese. Mandarin is widely spoken in northern China, whereas Cantonese and Fuzhounese are widely spoken in southern China. It can therefore be inferred that ______', NULL, 'Which choice most logically completes the text?', '{"A":"people who emigrate from northern China tend to settle in Flushing, while people who emigrate from southern China tend to settle in Chinatown.","B":"Chinese immigrants who moved to New York City long ago are more likely to speak several Chinese languages than are more recent Chinese immigrants.","C":"overall, there are more Cantonese and Fuzhounese speakers among Chinese immigrants in New York than there are Mandarin speakers.","D":"Chinese immigrants regularly move between Queens and Manhattan but rather than remaining in one borough."}'::jsonb, NULL, 'A', NULL, NULL, 16)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '1-15', 15, 'mcq', 'Maya Elena Bahr and colleagues conducted a study comparing musicians and nonmusicians in the volume, measured in decibels (dB), that they preferred when listening to various audio recordings, including solo piano pieces, symphonic works, and ocean sounds. The musicians, who reported far greater lifetime noise exposure than the nonmusicians, generally listened to the recordings at higher volumes than the nonmusicians did. The two groups had clinically similar hearing, however, suggesting that although a musician''s preferred volume for a favorite recording may be 64.8 dB and a nonmusician''s might be 63.9 dB, this difference ______', NULL, 'Which choice, if true, would most directly support the researcher''s claim?', '{"A":"is unlikely to listen to a nonfavorite recording at a higher volume than the nonmusician.","B":"shows that both the musician and the nonmusician have lower hearing ability than would be expected of clinically typical individuals with typical levels of lifetime noise exposure.","C":"does not arise from the musician having a clinically significant reduction in hearing ability as a result of lifetime noise exposure.","D":"cannot be explained as resulting from the musician''s relatively greater musical expertise."}'::jsonb, NULL, 'C', NULL, NULL, 17)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '1-16', 16, 'mcq', 'The Benny Beaver stuffed toy ______ blank a skeptical public when it was introduced in 1911 as a potential rival to the popular teddy bear. In fact, one columnist wrote that the toy''s appearance was "likely to give a baby [a]', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"faces.","B":"faced.","C":"is facing.","D":"will face."}'::jsonb, NULL, 'B', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '1-17', 17, 'mcq', 'The outer edge of the Sun''s magnetic reach is called the heliopause. This invisible border, which ______ created by the solar wind (charged particles from the Sun) colliding with interstellar space, has been crossed by only two spacecraft: Voyager 1 and Voyager 2.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"is","B":"were","C":"are","D":"have been"}'::jsonb, NULL, 'A', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '1-18', 18, 'mcq', 'Originally introduced in 2017 and later optimized for faster object detection, ______ compared with conventional detection methods.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"high accuracy and lower computational power requirements are achieved by the RetinaNet algorithm methods.","B":"the RetinaNet algorithm achieves high accuracy while requiring less computational power","C":"less computational power is required for the RetinaNet algorithm to achieve high accuracy","D":"high accuracy while requiring less computational power is the RetinaNet algorithm''s achievement"}'::jsonb, NULL, 'B', NULL, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '1-19', 19, 'mcq', 'Although calling the handfish (family Brachionichthyidae) a "walking fish" might suggest an animal that has fully transitioned to life on land, the handfish''s unusual locomotion is actually a specialized adaptation for moving along the seafloor ______ blank the handfish''s modified pectoral fins function much like legs, enabling this distinctive marine predator to "walk" across the ocean bottom in the temperate waters it inhabits.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"seafloor,","B":"seafloor:","C":"seafloor","D":"seafloor and"}'::jsonb, NULL, 'B', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '1-20', 20, 'mcq', 'Policy ______ blank archival labor-market data is essential to evaluating the effects of different employment laws. These long-term records allow scholars to compare countries'' labor conditions before a law is introduced with conditions that emerge years after enactment.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"analyst''s access to country''s","B":"analysts'' access to countries''","C":"analysts access to countries''","D":"analysts access to countries"}'::jsonb, NULL, 'B', NULL, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '1-21', 21, 'mcq', 'At dawn, while the air is still cool, the desert iguana rests in sunny places to warm itself ______ as the day becomes hotter, the desert iguana moves into shaded areas and under stones to avoid getting too warm.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Previously,","B":"For example,","C":"Later,","D":"First,"}'::jsonb, NULL, 'C', NULL, NULL, 23)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '1-22', 22, 'mcq', 'Although most animals seek the protection of nighttime migration, many poisonous amphibians—a group that includes the Colorado River toad and the strawberry poison dart frog—move safely during the day. ______ with the sun overhead, the amphibians'' vivid color patterns warn visually oriented daytime predators of the animals'' toxicity.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"However,","B":"At that time,","C":"For example,","D":"In other words,"}'::jsonb, NULL, 'B', NULL, NULL, 24)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '1-23', 23, 'mcq', 'Many poetry anthologies include only a single poem from each poet, but Asha K. Raman''s Echoes of Contemporary Verse includes generous selections from each poet. ______ Raman includes multiple poems by Olivia Chen and Marcus Redbird. This allows readers to engage with a wide range of each poet''s', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"In addition,","B":"Next,","C":"For example,","D":"However,"}'::jsonb, NULL, 'C', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '1-24', 24, 'mcq', 'The widespread adoption of point-based judging in combat sports reflects a preference, shaped largely by Western traditions, for competitions that can be measured numerically. ______ in traditional Muay Thai, judges treat a match as an unfolding story in which the meaning of any single exchange depends on the larger course of the bout—the winner being determined not by a point total of separate actions but by an overall evaluation of the fighters''', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Partly because of that preference,","B":"As one more example of that system,","C":"By contrast with that model,","D":"Designed with much the same purpose,"}'::jsonb, NULL, 'C', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '1-25', 25, 'mcq', 'While researching a topic, a student has taken the following notes:
- A nonnative species that causes environmental or economic harm when introduced to an ecosystem is considered invasive.
- Leafy spurge is an invasive species of flowering plant that crowds out livestock forage and native plants.
- Water hyacinth is an invasive aquatic species that blocks sunlight and reduces oxygen levels in bodies of water, causing environmental harm.
- Leafy spurge was first introduced accidentally through contaminated seed, but it now crowds out livestock forage and native plants.
- Water hyacinth is now an invasive species in the US.', NULL, 'The student wants to emphasize a similarity between leafy spurge and water hyacinth. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Water hyacinth is an invasive species that blocks sunlight and reduces oxygen levels in bodies of water, causing environmental harm.","B":"Leafy spurge was first introduced accidentally through contaminated seed, but it now crowds out livestock forage and native plants.","C":"Two harmful species caused by water hyacinth and leafy spurge has led both species to be considered invasive in the US.","D":"Leafy spurge is an invasive species of aquatic plant, and water hyacinth was first introduced accidentally through contaminated seed."}'::jsonb, NULL, 'C', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '1-26', 26, 'mcq', 'While researching a topic, a student has taken the following notes:
- The CITYGREEN project examined different kinds of urban natural areas across cities.
- Urban natural areas can be types that include the natural features.
- Home gardens were one type of urban natural area included in the project.
- Home gardens are private gardens on residential properties throughout a city.
- They can help cities by increasing plant species diversity.', NULL, 'The student wants to provide a specific example of one kind of urban natural area. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"The CITYGREEN project examined different kinds of urban natural areas, which are spaces in cities that include natural features.","B":"Urban natural areas can help cities by increasing plant species diversity.","C":"One specific example of a kind of urban natural area is home gardens, which are private gardens on residential properties throughout a city.","D":"Spaces in cities that include natural features are called urban natural areas."}'::jsonb, NULL, 'C', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '1-27', 27, 'mcq', 'While researching a topic, a student has taken the following notes:
- Nandi Khumalo was a singer born in 1962.
- Khumalo recorded traditional South African and popular European and American songs.
- Her 1972 album Remember Me features classic European and American songs from European and American artists of the time, such as "Here Comes the Sun."
- "Here Comes the Sun" was originally made popular by the English rock band the Beatles.', NULL, 'The student wants to emphasize a similarity between "Thula Bane" and "Here Comes the Sun." Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Nandi Khumalo''s 1962 album Nandi Khumalo features a mix of traditional South African and popular European and American songs.","B":"Her 1972 album Remember Me features a mix of traditional South African and popular European and American songs, such as \"Here Comes the Sun.\"","C":"Both \"Thula Bane\" and \"Here Comes the Sun\" can both be found on albums recorded by the South African singer Nandi Khumalo.","D":"Nandi Khumalo recorded many songs over her lifetime, including \"Thula Bane,\" which appears on her 1962 album Nandi."}'::jsonb, NULL, 'C', NULL, NULL, 29)
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
  VALUES (v_mod, 1, '2-1', 1, 'mcq', 'In restaurant kitchen ventilation design and construction, engineers carefully balance incoming and outgoing airflow to ______ blank negative pressure conditions. If the air pressure is lower in the kitchen than in nearby areas (that is, if there is negative pressure), fresh air will move from those areas into the kitchen, helping contain cooking odors and keep kitchen staff comfortable.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"estimate","B":"create","C":"prevent","D":"ignore"}'::jsonb, NULL, 'B', NULL, NULL, 30)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '2-2', 2, 'mcq', 'When trying to determine why an apartment''s circuit breaker has shut off, an electrician will usually ask tenants to ______ blank the devices that were in use when the electricity failed. This information is necessary so that the electrician can begin figuring out whether the continued outage is caused by a defective device or simply by too many devices running at the same time.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"activate","B":"itemize","C":"exchange","D":"refurbish"}'::jsonb, NULL, 'B', NULL, NULL, 31)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '2-3', 3, 'mcq', 'The dinosaur exhibits at museums such as the Field Museum in Chicago (which has a mounted Parasaurolophus skeleton among its collections) are notable for the ______ of the research behind them—the museum staff consulted numerous sources to ensure the accuracy of the displays.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"novelty","B":"rigor","C":"obscurity","D":"shallowness"}'::jsonb, NULL, 'B', NULL, NULL, 32)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '2-4', 4, 'mcq', 'A distinctive habitat at the boundary between surface water and groundwater in river corridors, a river''s hyporheic zone (HZ) can extend well beyond its banks: for a major river like the Mississippi, the HZ may reach as far as 300 meters from the main channel. Because it is difficult to access directly, scientists use ______ to assess the HZ—for example, by tracking aquatic organisms found in well past a river''s banks.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"parameters","B":"proxies","C":"simulations","D":"auxiliaries"}'::jsonb, NULL, 'B', NULL, NULL, 33)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '2-5', 5, 'mcq', 'The following text is adapted from the 1896 poem "Odina" by Emily Pauline Johnson, a Kanien''kehá:ka (Mohawk) writer also known as Tekahionwake. I am Odina, I am she, the wife of him whose name breathes valor and life. And courage to the people who call him chief. I am Odina, his bright star, and he Is earth, and river, and sky—and soul to me', NULL, 'As used in the text, what does the word "breathes" most nearly mean?', '{"A":"Relinquishes","B":"Absorbs","C":"Imparts","D":"Surrenders"}'::jsonb, NULL, 'C', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '2-6', 6, 'mcq', 'Many models predict that as temperatures rise, North American tree populations will spread northward into habitats that are becoming newly suitable. However, forest surveys indicate that many species, such as the bur oak (Quercus macrocarpa) and the lodgepole pine (Pinus contorta), are showing migration lag—that is, they are not establishing northern populations as predicted. Research suggests that this lag is connected to reduced diversity of essential fungal partners at the northern edges of the trees'' ranges, making successful northward expansion difficult.', NULL, 'Which choice best describes the overall structure of the text?', '{"A":"It summarizes recent research findings, identifies a gap in current understanding, and then suggests future research to address that gap.","B":"It introduces a scientific model, presents several predictions made using data generated by the model, and then provides further support for one prediction over the others.","C":"It presents a scientific prediction, describes evidence that contradicts that prediction, and then offers an explanation for the contradiction.","D":"It describes an environmental problem, discusses several attempted solutions, and then proposes a new solution."}'::jsonb, NULL, 'C', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '2-7', 7, 'mcq', 'Early television criticism in the 1970s and 1980s drew heavily on film studies, though media scholar Jane Feuer observed that concepts borrowed from that discipline often fell short when applied to television''s distinctive features. Recognizing these limits, researchers turned to approaches that considered home viewing environments, built-in commercials, and episodic storytelling, as well as to audience studies using ethnographic methods that highlighted viewer participation. By the 1990s, television studies had become a broadly established academic field, with scholars launching specialized journals.', NULL, 'Which choice best states the function of the underlined portion in the text as a whole?', '{"A":"It questions the extent to which the methodologies of film studies informed methodologies in the emerging field of television studies.","B":"It implies that the development of television studies as a discipline was slowed by scholars'' early reluctance to accept that television and film have different characteristics.","C":"It suggests that Feuer''s observations were the primary catalyst for the emergence of television studies as a formal academic field.","D":"It introduces an expert opinion that establishes the impetus for a change in scholarly methods of studying television."}'::jsonb, NULL, 'D', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '2-8', 8, 'mcq', 'Text 1
Studies adding to the evidence that people generally enjoy socializing have often focused on interactions within ongoing relationships (from siblings to coworkers), but psychologist Lina Mercado and colleagues have shown the value of making connections with strangers. Participants in their study who warmly greeted a campus bus driver reported greater positive affect than those who didn''t speak to the driver.

Text 2
Research on social ties often relies on a model that places an individual within three concentric circles. The innermost circle contains one''s strongest ties (e.g., a beloved friend), the next contains close but less central ties (e.g., a classmate on a club team), and the outermost contains weak ties (those more distant but still important enough to count as part of one''s social network).', NULL, 'Based on the texts, what would Mercado and colleagues (Text 1) most likely say about the discussion of the model in Text 2?', '{"A":"It reflects an overemphasis on relationship duration in researchers'' assessments of the relative importance of different connections in a person''s social network.","B":"It highlights that most research on social interaction overlooks a kind of connection that can positively affect individuals'' well-being.","C":"It emphasizes distinctions among types of close relationships that aren''t adequately represented in social-ties research, since most studies classify relationships as either close or casual.","D":"It accounts for researchers'' observations that people usually expect interactions with familiar individuals to be more positive than interactions with unfamiliar individuals."}'::jsonb, NULL, 'B', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '2-9', 9, 'mcq', 'Average DOC and TDN Concentrations in Rainwater Samples
To investigate how trees influence the chemistry of rainwater, a student consulted data collected during several precipitation events at sites in a temperate forest in the upper Midwest of the United States. The student considered three kinds of rainwater samples: regular rainfall (falling directly into a container), throughfall (passing through a tree''s canopy), and stemflow (running down a tree''s branches and trunk). Noting that regular samples had average concentrations of 0.90 mg/L of dissolved organic carbon (DOC) and 0.19 mg/L of total dissolved nitrogen (TDN) across events, the student concluded that contact with trees changes the chemical composition of rainwater before it reaches the ground.
Precipitation event | Rainwater type | Average DOC (mg/L) | Average TDN (mg/L)
6 | throughfall | 7.67 | 0.309
8 | stemflow | 98.70 | 3.221
12 | stemflow | 51.84 | 1.501', NULL, 'Which choice best explains how well the data in the table support the student''s conclusion?', '{"A":"The differences between the average concentrations of DOC and TDN in the stemflow and throughfall samples and those reported for regular samples vary greatly across precipitation events, which calls the conclusion into question.","B":"The average concentrations of DOC and TDN in the stemflow samples are higher than those in the throughfall samples, supporting the conclusion for only one kind of tree contact.","C":"The average concentrations of DOC and TDN in the stemflow and throughfall samples are higher than those in the regular samples, which strongly supports the conclusion.","D":"The average DOC concentrations are higher in the stemflow and throughfall samples than in the regular samples, whereas the average TDN concentrations are slightly lower than in the regular samples, which weakly supports the conclusion."}'::jsonb, NULL, 'C', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '2-10', 10, 'mcq', 'Bar graph titled Participants'' Receptiveness to Marketing Message Content. The horizontal axis is labeled Result by condition. 3 bars are shown. The vertical axis is labeled Average rating. It ranges from 0 to 4.5. Refer to long description. – All values are approximate. – The Average rating data for the 3 bars are as follows: supplement: 3.7 substitute: 4.1 control: 4.2 Having found that object emojis generally have a negative effect when used in social media marketing, Anika Desai and team studied reactions to three versions of a bakery''s message about tea: one with a teacup emoji after the text (supplement), one with the emoji standing in for the word "tea" (substitute), and one with no emoji (control). Participants rated their openness to the content of the version of the message they saw, on a scale from 1 (not at all open) to 7 (very open). The team hypothesized that the general effect they''d previously observed would be reduced when an emoji replaces the word it represents.', NULL, 'Which choice best describes data from the graph that support the team''s hypothesis?', '{"A":"The highest average rating for any of the three conditions was well below the maximum rating of 7.","B":"The average rating for the control condition was higher than the average rating for the supplement condition.","C":"The average rating for the substitute condition was higher than the average rating for the supplement condition.","D":"The substitute condition and the control condition both received an average rating of about 4"}'::jsonb, NULL, 'C', NULL, NULL, 41)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '2-11', 11, 'mcq', 'After showing that the power-conversion efficiency of newly developed perovskite solar cells is nearly the same as that of cells recycled several times, Meilin Zhou and colleagues calculated the levelized cost of electricity (LCOE)—the cost per unit of electricity generated, including both material-acquisition and operating expenses—for power plants using each type of cell. Assuming a 15-year cell lifetime, the LCOE for plants using new cells was 4.99 cents per kilowatt-hour, whereas the LCOE for plants using cells recycled three times was 4.05 cents per kilowatt-hour. Furthermore, when the assumed cell lifetime was reduced by two-thirds, the LCOE difference increased from 18.8% to 31.3%.', NULL, 'Based on the text, which choice, if true, best accounts for the observation presented in the underlined sentence?', '{"A":"As the assumed cell lifetime decreases, plant operating costs increase, and thus the LCOE for plants using new cells diverges from that of plants using recycled cells.","B":"Although recycling cells is less expensive than producing new ones, recycling still has costs, and thus shorter cell lifetimes lead to greater cumulative costs.","C":"Obtaining materials for new cells is more expensive than recycling materials from old cells, and thus more frequent cell replacement results in a greater difference in total costs.","D":"Cells can be recycled multiple times without a substantial drop in power-conversion efficiency, and thus recycling cells more frequently does not affect the LCOE for plants using recycled cells."}'::jsonb, NULL, 'C', NULL, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '2-12', 12, 'mcq', 'The Qimmiq, an Arctic breed believed to date before Europeans arrived in the Americas, descends from a precontact dog population. The Qimmiq carries a haplotype (a group of genetic variants inherited together from one parent) absent in European dogs but present in Northeast Asian dogs, supporting the idea that precontact breeds in the Americas descend from dogs that accompanied human migration from Asia during the last ice age. The Dixie dingo, a tan-coated breed native to the rural Gulf Coast of the United States, offers additional support: living individuals carry haplotype B217, part of a haplotype group unique to Northeast Asian dogs. Many other precontact breeds, such as Canada''s Tahltan bear dog, disappeared through interbreeding with dogs brought from Europe.', NULL, 'Which finding, if true, would most directly undermine the underlined claim?', '{"A":"Haplotype B217 is present in dog remains recovered in Northeast Asia and dating to before the emergence of the Dixie dingo.","B":"The Dixie dingo carries some genes that are also common in the remains of European dogs but before Europeans arrived in the Americas.","C":"Several modern Northeast Asian breeds were imported to the Gulf Coast of the United States in the 1900s, and the Dixie dingo''s recent ancestry may include individuals from these breeds.","D":"Haplotype B217 is present in precontact remains recovered from Arctic North America, where the Qimmiq originated, as well as in remains from other regions outside the Gulf Coast."}'::jsonb, NULL, 'C', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '2-13', 13, 'mcq', 'Orbicella faveolata, a Caribbean coral with a boulder-like shape, and *Pocillopora eydouxi*, a coral from the Indian Ocean with branching clusters, are both stony corals—the type that builds reefs. Increasing stony coral colonies worldwide is a key objective for ecologists, since land-based runoff and other pressures are causing growing harm to reefs. In the wild, crustose coralline algae (CCA) promote growth in the healthy reefs they inhabit by releasing lipids and other metabolites—chemical cues that trigger coral larvae settlement. Biotechnology researcher Lina Haddad and team have developed a tool to restore those cues in damaged reefs: a gel coating infused with metabolites derived from Indian Ocean CCA. In tests with *Porites lutea*, an Indian Ocean stony coral, settlement rates rose substantially.', NULL, 'Which finding, if true, would best support a claim that the new tool already has the capacity to support the scope of the ecologists'' objective?', '{"A":"The lipids and other metabolites derived from Indian Ocean CCA seem to remain stable for long periods under a variety of water temperatures and environmental conditions.","B":"Exposure to lipids and other metabolites released by CCA from Indian Ocean reefs improves settlement rates for larvae of Orbicella faveolata and a variety of other coral species in regions outside the Indian Ocean.","C":"In Indian Ocean reefs, higher concentrations of lipids and other metabolites released by local CCA are linked to larger colonies of Pocillopora eydouxi and greater overall diversity of coral species.","D":"When CCA are present and releasing lipids and other metabolites, larvae settlement rates improve nearly as much in damaged reefs with Porites lutea as they do in healthy reefs containing that coral."}'::jsonb, NULL, 'B', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '2-14', 14, 'mcq', 'For brands of bottled iced tea sold in Australia, the mean line length—the number of products sharing a brand name—is 10.2, while for brands of cookies, the mean line length is 24.1. Elena Markovic and colleagues examined 203 months of economic data to investigate whether line length mediates the effects of economic expansions and contractions on brand equity (the value, manifesting as a price premium, that a brand has in consumers'' minds due to its perceived quality and other associations). They noted that it becomes more difficult for consumers to evaluate brand quality as line length increases and that consumers show high risk aversion during economic downturns. Markovic and colleagues would thus expect that ______', NULL, 'Which choice most logically completes the text?', '{"A":"brand-related price premiums for bottled iced tea will likely show less variation across economic contractions and expansions than such premiums for cookies will.","B":"brands of bottled iced tea are more likely to increase their line lengths during economic contractions than brands of cookies are.","C":"brand-related price premiums for bottled iced tea are more likely to be maintained during economic contractions than are such premiums for cookies.","D":"brands of bottled iced tea will likely have higher brand equity than brands of cookies will during economic contractions but not during economic expansions."}'::jsonb, NULL, 'C', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '2-15', 15, 'mcq', '"Golden Hours" by Clara J. Whitmore, published in the Chicago Evening Post in 1878, exemplifies the phenomenon of "fugitive verse," poems reprinted in newspapers and other nineteenth-century US periodicals without authorial oversight or even, in many cases, knowledge. Though poems that became fugitive verse were typical of newspaper poetry of their era in their reliance on such elements as simple rhyme schemes and everyday settings, the phenomenon of fugitive verse represents a significant departure from the dominant model of literary authorship in which a work is controlled by a single and publicly identified author. This practice, however, was accepted as routine, even by the poets affected; that it has come to seem anomalous is indicative of the fact that ______', NULL, 'Which choice most logically completes the text?', '{"A":"the authors of nineteenth-century newspaper poetry placed less value on artistic control than did their contemporaries who wrote other types of literature.","B":"the concept of authorship and the privileges associated with the author''s role are mediated by the contexts within which works are written and published.","C":"the notion that authors should have control over the reprinting of their works was a contested issue in nineteenth-century literary culture.","D":"the literary characteristics of works disseminated through commercial venues are influenced by the circumstances of publication as well as by authorial choices."}'::jsonb, NULL, 'B', NULL, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '2-16', 16, 'mcq', 'The scientific team using the Prime Focus Spectrograph (PFS) to conduct a cosmological survey, which has produced one of the most detailed 3D maps of the cosmos to date, plans to observe roughly 45 million celestial objects. Mounted on a telescope in Chile, ______', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"this impressive instrument can measure 4,000 galaxies simultaneously, tracking how matter is distributed throughout the cosmos.","B":"the distribution of matter throughout the cosmos is tracked by researchers using this impressive instrument that can measure 4,000 galaxies simultaneously.","C":"4,000 galaxies can be measured simultaneously by this impressive instrument, tracking how matter is distributed throughout the cosmos.","D":"researchers track how matter is distributed throughout the cosmos with this impressive instrument that can measure 4,000 galaxies simultaneously."}'::jsonb, NULL, 'A', NULL, NULL, 50)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '2-17', 17, 'mcq', 'The furnaces used in ancient China to produce glazed tiles reached heights of 150 feet and diameters of 24 feet. These massive structures were used to heat clay mixtures to temperatures of up to 230 degrees ______ such intense heat produced chemical effects that couldn''t occur with air-dried clay.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"Celsius,","B":"Celsius and","C":"Celsius;","D":"Celsius"}'::jsonb, NULL, 'C', NULL, NULL, 51)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '2-18', 18, 'mcq', 'Curator Elena Martínez organized the 2026 exhibition Hidden Threads: Clara Wells''s Textile Archive at the Oregon Historical Museum in Portland with a twofold ______ the achievements of Wells, an innovative early-20th-century textile historian, and highlighting the museum''s extensive fabric collection.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"purpose recognizing","B":"purpose, celebrating:","C":"purpose: celebrating","D":"purpose; celebrating"}'::jsonb, NULL, 'C', NULL, NULL, 52)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '2-19', 19, 'mcq', 'According to period records, courtly entertainment—including cards, dice, and other games enjoyed in palaces and wealthy households—______ blank primarily centered on strategic play that reflected social hierarchies. Trick-taking card games, with their ranked suits and formal rules, were especially fashionable during this era.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"were","B":"being","C":"was","D":"are"}'::jsonb, NULL, 'C', NULL, NULL, 53)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '2-20', 20, 'mcq', 'A 1932 report by celebrated US track coach Lawson Robertson ______ that the limits of human physiology ruled out a mile time under 4:01.6 was disproved by Roger Bannister''s sub-four-minute mile in 1954—not to mention the fact that more than 2,000 runners have since matched Bannister''s feat.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"asserted","B":"had asserted","C":"asserts","D":"asserting"}'::jsonb, NULL, 'D', NULL, NULL, 54)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '2-21', 21, 'mcq', 'In recent years, the English poet Charlotte Smith (1749–1806), whose verse was widely read during her lifetime, has been rediscovered by contemporary audiences—a resurgence of interest that is largely due to literary scholars such as Elena Matthews, whose work ______ the richness of Smith''s poems and the poet''s historical importance to the Romantic literary movement encourages a broader rethinking of British Romanticism itself.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"has highlighted","B":"highlighting","C":"is highlighting","D":"highlights"}'::jsonb, NULL, 'D', NULL, NULL, 55)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '2-22', 22, 'mcq', 'Mark di Suvero''s steel sculpture Schubert Sonata is displayed at Millennium Park, an outdoor art space in Chicago. ______ it is exposed to rain, snow, heat, and humidity. Di Suvero''s sculpture is particularly well suited to withstand these conditions, though, because it is made of weathering steel.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"However,","B":"There,","C":"In addition,","D":"Nevertheless,"}'::jsonb, NULL, 'B', NULL, NULL, 56)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '2-23', 23, 'mcq', 'Even though it is about 1,400 light-years from Earth, the star Mintaka is still one of the brightest stars visible in the night sky, ranking 31st. While not as bright as Mintaka, the star Merak also ranks among the 50 brightest stars, coming in 39th. ______ Merak''s brightness is probably explained by its relative closeness to Earth: Merak is only about 80 light-years away.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Indeed,","B":"Similarly,","C":"Granted,","D":"As a result,"}'::jsonb, NULL, 'C', NULL, NULL, 57)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '2-24', 24, 'mcq', 'When ordering the branches of the Stikine River system, cartographers tend to begin with the riverway''s lowest point, the Stikine River. ______ hydrologists begin at the top of the river system, with the Tuya River and other tributaries fed by the riverway''s source, Tuya lake.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"In a similar way,","B":"By contrast,","C":"For example,","D":"In other words,"}'::jsonb, NULL, 'B', NULL, NULL, 58)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '2-25', 25, 'mcq', 'Fragments of ceramic griddles have been uncovered across southeastern Anatolia, dating to the Chalcolithic Period. Molina et al. wanted to determine whether the use-wear patterns on the griddle fragments were consistent with the cooking of oil-rich flatbreads. ______ they cooked such flatbreads in reconstructed griddles and compared the use-wear patterns on the reconstructed tools with those on the fragments.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Nevertheless,","B":"To that end,","C":"In other words,","D":"In addition,"}'::jsonb, NULL, 'B', NULL, NULL, 59)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '2-26', 26, 'mcq', 'While researching a topic, a student took the following notes:
– Late 1800s to early 1900s: Japanese manga (comics) typically used an orderly vertical format with four panels on each page.
– Late 1800s to late 1980s: Strongly influenced by manga, Taiwanese manhua (comics) also tended to use a structured layout.
– After 1945: Manga artists began experimenting with panels of different sizes to heighten visual tension (by creating visual sight lines between a character in one panel and an object in the next).
– 1947 to late 1980s: Taiwanese manhua artists adopted additional manga traits, such as genre features and greater narrative complexity.', NULL, 'The student wants to describe how Taiwanese manhua relates to manga from the late 1800s through the late 1980s. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"From the late 1800s to the late 1980s, Taiwanese manhua increasingly broke away from manga by developing more innovative layouts.","B":"Even though Taiwanese manhua did not always follow every development in manga during this period, it remained heavily influenced by manga.","C":"From the time manga''s layout first started changing in the late 1800s until manga adopted dynamic panel sizing in the late 1980s, Taiwanese manhua kept a structured layout.","D":"Although Taiwanese manhua artists initially rejected manga''s growing genre range and narrative complexity, they adopted those features in the early 1900s."}'::jsonb, NULL, 'B', NULL, NULL, 60)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '2-27', 27, 'mcq', 'While researching a topic, a student has taken the following notes:
– A 2023 investigation examined the facial expressions of wolves and domestic dogs.
– In the investigation, facial expressions were coded using 46 distinct facial actions.
– The "ears rotator" facial action is seen in wolves.
– Dog breeds with upright (wolf-like) ears can produce the "ears rotator" facial action.
– Dog breeds with drooped (non-wolf-like) ears cannot produce the "ears rotator" facial action.', NULL, 'The student wants to contrast dog breeds with wolf-like ears and dog breeds with nonwolf-like ears. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"In a 2023 investigation, dog breeds with non-wolf-like ears were able to produce the same facial movements that wolves could.","B":"Non-wolf-like ears are drooped or partly drooped, but wolf-like ears are different: they are upright and can produce the \"ears rotator\" facial action.","C":"Like wolves, dog breeds with upright ears can produce the \"ears rotator\" facial action, while those with drooped or partly drooped ears cannot.","D":"One difference between dog breeds with wolf-like ears and dog breeds without them is that wolf-like breeds cannot produce the \"ears rotator\" facial action."}'::jsonb, NULL, 'C', NULL, NULL, 61)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
END $seed$;
