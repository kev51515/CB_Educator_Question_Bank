-- =============================================================================
-- Migration: 0165_seed_cb_og_2.sql
-- Purpose:   Seed "CB OG #2" (College Board linear Digital SAT practice test,
--            66 RW + 54 Math = 120 Q) into the full-test tables from 0048.
--   Source:  sat-practice-test-2-digital.pdf; official College Board answer key (pdf/Key/).
--   Idempotent upsert on (slug)/(test_id,position)/(module_id,position).
-- =============================================================================
DO $seed$
DECLARE v_test uuid; v_mod uuid;
BEGIN
  INSERT INTO public.tests (slug, ordinal, title, short_title, source, total_questions)
  VALUES ('cb-og-2', 8, 'CB OG #2', 'CB OG #2', 'sat-practice-test-2-digital.pdf', 120)
  ON CONFLICT (slug) DO UPDATE SET ordinal=EXCLUDED.ordinal, title=EXCLUDED.title,
    short_title=EXCLUDED.short_title, source=EXCLUDED.source, total_questions=EXCLUDED.total_questions
  RETURNING id INTO v_test;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 1, 'reading-writing', 'Reading and Writing — Module 1', 1920, 33)
  ON CONFLICT (test_id, position) DO UPDATE SET section=EXCLUDED.section, label=EXCLUDED.label,
    time_limit_seconds=EXCLUDED.time_limit_seconds, question_count=EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '1-1', 1, 'mcq', 'As Mexico''s first president from an Indigenous community, Benito Juarez became one of the most ______ figures in his country''s history: among the many significant accomplishments of his long tenure in office (1858–1872), Juarez consolidated the authority of the national government and advanced the rights of Indigenous peoples.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"unpredictable","B":"important","C":"secretive","D":"ordinary"}'::jsonb, NULL, 'B', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '1-2', 2, 'mcq', 'Due to their often strange images, highly experimental syntax, and opaque subject matter, many of John Ashbery''s poems can be quite difficult to ______, and thus are the object of heated debate among scholars.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"delegate","B":"compose","C":"interpret","D":"renounce"}'::jsonb, NULL, 'C', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '1-3', 3, 'mcq', 'The Cambrian explosion gets its name from the sudden appearance and rapid diversification of animal remains in the fossil record about 541 million years ago, during the Cambrian period. Some scientists argue that this ______ change in the fossil record might be because of a shift in many organisms to body types that were more likely to be preserved.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"catastrophic","B":"elusive","C":"abrupt","D":"imminent"}'::jsonb, NULL, 'C', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '1-4', 4, 'mcq', 'During a 2014 archaeological dig in Spain, Vicente Lull and his team uncovered the skeleton of a woman from El Algar, an Early Bronze Age society, buried with valuable objects signaling a high position of power. This finding may persuade researchers who have argued that Bronze Age societies were ruled by men to ______ that women may have also held leadership roles.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"waive","B":"concede","C":"refute","D":"require"}'::jsonb, NULL, 'B', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '1-5', 5, 'mcq', 'Within baleen whale species, some individuals develop an accessory spleen—a seemingly functionless formation of splenetic tissue outside the normal spleen. Given the formation''s greater prevalence among whales known to make deeper dives, some researchers hypothesize that its role isn''t ______; rather, the accessory spleen may actively support diving mechanisms.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"replicable","B":"predetermined","C":"operative","D":"latent"}'::jsonb, NULL, 'D', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '1-6', 6, 'mcq', 'According to a US tax policy expert, state taxes are ______, other factors when considering an interstate move. Even significant differences in state taxation have almost no effect on most people''s decisions, while differences in employment opportunities, housing availability, and climate are strong influences.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"consistent with","B":"representative of","C":"overshadowed by","D":"irrelevant to"}'::jsonb, NULL, 'C', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '1-7', 7, 'mcq', 'The author''s claim about the relationship between Neanderthals and <i>Homo sapiens</i> is ______, as it fails to account for several recent archaeological discoveries. To be convincing, his argument would need to address recent finds of additional hominid fossils, such as the latest Denisovan specimens and <i>Homo longi</i>.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"disorienting","B":"tenuous","C":"nuanced","D":"unoriginal"}'::jsonb, NULL, 'B', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '1-8', 8, 'mcq', 'The following text is from Georgia Douglas Johnson''s 1922 poem "Benediction."

Go forth, my son,
Winged by my heart''s desire!
Great reaches, yet unknown,
Await
For your possession.
I may not, if I would,
Retrace the way with you,
My pilgrimage is through,
But life is calling you!', NULL, 'Which choice best states the main purpose of the text?', '{"A":"To express hope that a child will have the same accomplishments as his parent did","B":"To suggest that raising a child involves many struggles","C":"To warn a child that he will face many challenges throughout his life","D":"To encourage a child to embrace the experiences life will offer"}'::jsonb, NULL, 'D', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '1-9', 9, 'mcq', 'The following text is adapted from <i>Indian Boyhood</i>, a 1902 memoir by Ohiyesa (Charles A. Eastman), a Santee Dakota writer. In the text, Ohiyesa recalls how the women in his tribe harvested maple syrup during his childhood.

Now the women began to test the trees—moving leisurely among them, axe in hand, and striking a single quick blow, to see if the sap would appear. <u>The trees, like people, have their individual characters; some were ready to yield up their life-blood, while others were more reluctant.</u> Now one of the birchen basins was set under each tree, and a hardwood chip driven deep into the cut which the axe had made. From the corners of this chip—at first drop by drop, then more freely—the sap trickled into the little dishes.', NULL, 'Which choice best describes the function of the underlined sentence in the text as a whole?', '{"A":"It portrays the range of personality traits displayed by the women as they work.","B":"It foregrounds the beneficial relationship between humans and maple trees.","C":"It demonstrates how human behavior can be influenced by the natural environment.","D":"It elaborates on an aspect of the maple trees that the women evaluate."}'::jsonb, NULL, 'D', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '1-10', 10, 'mcq', 'Text 1
Ecologists have long wondered how thousands of microscopic phytoplankton species can live together near ocean surfaces competing for the same resources. According to conventional wisdom, one species should emerge after outcompeting the rest. So why do so many species remain? Ecologists'' many efforts to explain this phenomenon still haven''t uncovered a satisfactory explanation.

Text 2
Ecologist Michael Behrenfeld and colleagues have connected phytoplankton''s diversity to their microscopic size. Because these organisms are so tiny, they are spaced relatively far apart from each other in ocean water and, moreover, experience that water as a relatively dense substance. This in turn makes it hard for them to move around and interact with one another. Therefore, says Behrenfeld''s team, direct competition among phytoplankton probably happens much less than previously thought.', NULL, 'Based on the texts, how would Behrenfeld and colleagues (Text 2) most likely respond to the "conventional wisdom" discussed in Text 1?', '{"A":"By arguing that it is based on a misconception about phytoplankton species competing with one another","B":"By asserting that it fails to recognize that routine replenishment of ocean nutrients prevents competition between phytoplankton species","C":"By suggesting that their own findings help clarify how phytoplankton species are able to compete with larger organisms","D":"By recommending that more ecologists focus their research on how competition among phytoplankton species is increased with water density"}'::jsonb, NULL, 'A', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '1-11', 11, 'mcq', 'In 2014, Amelia Quon and her team at NASA set out to build a helicopter capable of flying on Mars. Because Mars''s atmosphere is only one percent as dense as Earth''s, the air of Mars would not provide enough resistance to the rotating blades of a standard helicopter for the aircraft to stay aloft. For five years, Quon''s team tested designs in a lab that mimicked Mars''s atmospheric conditions. The craft the team ultimately designed can fly on Mars because its blades are longer and rotate faster than those of a helicopter of the same size built for Earth.', NULL, 'According to the text, why would a helicopter built for Earth be unable to fly on Mars?', '{"A":"Because Mars and Earth have different atmospheric conditions","B":"Because the blades of helicopters built for Earth are too large to work on Mars","C":"Because the gravity of Mars is much weaker than the gravity of Earth","D":"Because helicopters built for Earth are too small to handle the conditions on Mars"}'::jsonb, NULL, 'A', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '1-12', 12, 'mcq', 'In West Africa, jalis have traditionally been keepers of information about family histories and records of important events. They have often served as teachers and advisers, too. New technologies may have changed some aspects of the role today, but jalis continue to be valued for knowing and protecting their peoples'' stories.', NULL, 'Which choice best states the main idea of the text?', '{"A":"Even though there have been some changes in their role, jalis continue to preserve their communities'' histories.","B":"Although jalis have many roles, many of them like teaching best.","C":"Jalis have been entertaining the people within their communities for centuries.","D":"Technology can now do some of the things jalis used to be responsible for."}'::jsonb, NULL, 'A', NULL, NULL, 9)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '1-13', 13, 'mcq', 'In 1934 physicist Eugene Wigner posited the existence of a crystal consisting entirely of electrons in a honeycomb-like structure. The so-called Wigner crystal remained largely conjecture, however, until Feng Wang and colleagues announced in 2021 that they had captured an image of one. The researchers trapped electrons between two semiconductors and then cooled the apparatus, causing the electrons to settle into a crystalline structure. By inserting an ultrathin sheet of graphene above the crystal, the researchers obtained an impression—the first visual confirmation of the Wigner crystal.', NULL, 'Which choice best states the main idea of the text?', '{"A":"Researchers have obtained the most definitive evidence to date of the existence of the Wigner crystal.","B":"Researchers have identified an innovative new method for working with unusual crystalline structures.","C":"Graphene is the most important of the components required to capture an image of a Wigner crystal.","D":"It''s difficult to acquire an image of a Wigner crystal because of the crystal''s honeycomb structure."}'::jsonb, NULL, 'A', NULL, NULL, 9)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '1-14', 14, 'mcq', 'Bar graph titled "Average Number of Individuals Reporting Directly to CEOs." The y-axis is "Average number of individuals directly reporting to CEO" (scale 0 to 7). The x-axis shows three time periods. Two bars per period: managers and department leaders. 1991–1995: managers 2.0, department leaders 3.3. 1996–2001: managers 2.5, department leaders 4.0. 2001–2008: managers 3.0, department leaders 6.8.

Considering a large sample of companies, economics experts Maria Guadalupe, Julie Wulf, and Raghuram Rajan assessed the number of managers and leaders from different departments who reported directly to a chief executive officer (CEO). According to the researchers, the findings suggest that across the years analyzed, there was a growing interest among CEOs in connecting with more departments in their companies.', 'Bar graph titled "Average Number of Individuals Reporting Directly to CEOs." The y-axis is "Average number of individuals directly reporting to CEO" (scale 0 to 7). The x-axis is "Years" with three periods: 1991–1995, 1996–2001, 2001–2008. Two bars per period: managers and department leaders. 1991–1995: managers 2.0, department leaders 3.3. 1996–2001: managers 2.5, department leaders 4.0. 2001–2008: managers 3.0, department leaders 6.8.', 'Which choice best describes data from the graph that support the researchers'' conclusion?', '{"A":"The average numbers of managers and department leaders reporting directly to their CEO didn’t fluctuate from the 1991–1995 period to the 2001–2008 period.","B":"The average number of managers reporting directly to their CEO was highest in the 1996–2001 period.","C":"The average number of department leaders reporting directly to their CEO was greater than the average number of managers reporting directly to their CEO in each of the three periods studied.","D":"The average number of department leaders reporting directly to their CEO rose over the three periods studied."}'::jsonb, '/data/tests/cb-og-2/figures/m1-q14.png', 'D', NULL, NULL, 10)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '1-15', 15, 'mcq', 'When digging for clams, their primary food, sea otters damage the roots of eelgrass plants growing on the seafloor. Near Vancouver Island in Canada, the otter population is large and well established, yet the eelgrass meadows are healthier than those found elsewhere off Canada''s coast. To explain this, conservation scientist Erin Foster and colleagues compared the Vancouver Island meadows to meadows where otters are absent or were reintroduced only recently. Finding that the Vancouver Island meadows have a more diverse gene pool than the others do, Foster hypothesized that damage to eelgrass roots increases the plant''s rate of sexual reproduction; this, in turn, boosts genetic diversity, which benefits the meadow''s health overall.', NULL, 'Which finding, if true, would most directly undermine Foster''s hypothesis?', '{"A":"At some sites in the study, eelgrass meadows are found near otter populations that are small and have only recently been reintroduced.","B":"At several sites not included in the study, there are large, well-established sea otter populations but no eelgrass meadows.","C":"At several sites not included in the study, eelgrass meadows'' health correlates negatively with the length of residence and size of otter populations.","D":"At some sites in the study, the health of plants unrelated to eelgrass correlates negatively with the length of residence and size of otter populations."}'::jsonb, NULL, 'C', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '1-16', 16, 'mcq', 'Scholars have noted that F. Scott Fitzgerald''s writings were likely influenced in part by his marriage to Zelda Fitzgerald, but many don''t recognize Zelda as a writer in her own right. Indeed, Zelda authored several works herself, such as the novel <i>Save Me the Waltz</i> and numerous short stories. Thus, those who primarily view Zelda as an inspiration for F. Scott''s writings ______.', NULL, 'Which choice most logically completes the text?', '{"A":"overlook the many other factors that motivated F. Scott to write.","B":"risk misrepresenting the full range of Zelda''s contributions to literature.","C":"may draw inaccurate conclusions about how F. Scott and Zelda viewed each other''s works.","D":"tend to read the works of F. Scott and Zelda in an overly autobiographical light."}'::jsonb, NULL, 'B', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '1-17', 17, 'mcq', 'Among social animals that care for their young, such as chickens, macaque monkeys, and humans, newborns appear to show an innate attraction to faces and face-like stimuli. Elisabetta Versace and her colleagues used an image of three black dots arranged in the shape of eyes and a nose or mouth to test whether this trait also occurs in <i>Testudo</i> tortoises, which live alone and do not engage in parental care. They found that newborn hatchlings showed a significant preference for the image, suggesting that ______.', NULL, 'Which choice most logically completes the text?', '{"A":"face-like stimuli are likely perceived as harmless by newborns of social species that practice parental care but as threatening by newborns of solitary species without parental care.","B":"researchers should not assume that an innate attraction to face-like stimuli is necessarily an adaptation related to social interaction or parental care.","C":"researchers can assume that the attraction to face-like stimuli that is seen in social species that practice parental care is learned rather than innate.","D":"newly hatched <i>Testudo</i> tortoises show a stronger preference for face-like stimuli than adult <i>Testudo</i> tortoises do."}'::jsonb, NULL, 'B', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '1-18', 18, 'mcq', 'Compiled in the late 1500s largely through the efforts of Indigenous scribes, <i><i>Cantares</i> <i>Mexicanos</i></i> is the most important collection of poetry in Classical Nahuatl, the principal language of the Aztec Empire. The poems portray Aztec society before the occupation of the empire by the army of Spain, and marginal notes in <i><i>Cantares</i> <i>Mexicanos</i></i> indicate that much of the collection''s content predates the initial invasion. Nonetheless, some of the poems contain inarguable references to beliefs and customs common in Spain during this era. Thus, some scholars have concluded that ______.', NULL, 'Which choice most logically completes the text?', '{"A":"while its content largely predates the invasion, <i><i>Cantares</i> <i>Mexicanos</i></i> also contains additions made after the invasion.","B":"although those who compiled <i><i>Cantares</i> <i>Mexicanos</i></i> were fluent in Nahuatl, they had limited knowledge of the Spanish language.","C":"before the invasion by Spain, the poets of the Aztec Empire borrowed from the literary traditions of other societies.","D":"the references to beliefs and customs in Spain should be attributed to a coincidental resemblance between the societies of Spain and the Aztec Empire."}'::jsonb, NULL, 'A', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '1-19', 19, 'mcq', 'In a study of the cognitive abilities of white-faced capuchin monkeys (<i>Cebus imitator</i>), researchers neglected to control for the physical difficulty of the tasks they used to evaluate the monkeys. The cognitive abilities of monkeys given problems requiring little dexterity, such as sliding a panel to retrieve food, were judged by the same criteria as were those of monkeys given physically demanding problems, such as unscrewing a bottle and inserting a straw. The results of the study, therefore, ______.', NULL, 'Which choice most logically completes the text?', '{"A":"could suggest that there are differences in cognitive ability among the monkeys even though such differences may not actually exist.","B":"are useful for identifying tasks that the monkeys lack the cognitive capacity to perform but not for identifying tasks that the monkeys can perform.","C":"should not be taken as indicative of the cognitive abilities of any monkey species other than <i>C. imitator</i>.","D":"reveal more about the monkeys'' cognitive abilities when solving artificial problems than when solving problems encountered in the wild."}'::jsonb, NULL, 'A', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '1-20', 20, 'mcq', 'To survive when water is scarce, embryos inside African turquoise killifish eggs ______ a dormant state known as diapause. In this state, embryonic development is paused for as long as two years—longer than the life span of an adult killifish.', NULL, 'Which choice completes the text with the most logical and precise word or phrase to conform to the conventions of Standard English?', '{"A":"enter","B":"to enter","C":"having entered","D":"entering"}'::jsonb, NULL, 'A', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '1-21', 21, 'mcq', 'Formed in 1967 to foster political and economic stability within the Asia-Pacific region, the Association of Southeast Asian Nations was originally made up of five members: Thailand, the Philippines, Singapore, Malaysia, and Indonesia. By the end of the 1990s, the organization ______ its initial membership.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"has doubled","B":"had doubled","C":"doubles","D":"will double"}'::jsonb, NULL, 'B', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '1-22', 22, 'mcq', 'The intense pressure found in the deep ocean can affect the structure of proteins in fish''s cells, distorting the proteins'' shape. The chemical trimethylamine N-oxide (TMAO) counters this effect, ensuring that proteins retain their original ______ is found in high concentrations in the cells of the deepest-dwelling fish.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"configurations. TMAO","B":"configurations TMAO","C":"configurations, TMAO","D":"configurations and TMAO"}'::jsonb, NULL, 'A', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '1-23', 23, 'mcq', 'Food and the sensation of taste are central to Monique Truong''s novels. In <i>The Book of Salt</i>, for example, the exiled character of Bình connects to his native Saigon through the food he prepares, while in <i>Bitter in the Mouth</i>, the character of Linda ______ a form of synesthesia whereby the words she hears evoke tastes.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"experienced","B":"had experienced","C":"experiences","D":"will be experiencing"}'::jsonb, NULL, 'C', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '1-24', 24, 'mcq', 'Inventor John Friedman created a prototype of the first flexible straw by inserting a screw into a paper straw and, using dental floss, binding the straw tightly around the ______. When the floss and screw were removed, the resulting corrugations in the paper allowed the straw to bend easily over the edge of a glass.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"screw''s thread''s.","B":"screws'' threads.","C":"screw''s threads.","D":"screws threads''."}'::jsonb, NULL, 'C', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '1-25', 25, 'mcq', 'In her analysis of Edith Wharton''s <i>The House of Mirth</i> (1905), scholar Candace Waid observes that the novel depicts the upper classes of New York society as "consumed by the appetite of a soulless ______ an apt assessment given that <i>The House of Mirth</i> is set during the Gilded Age, a period marked by rapid industrialization, economic greed, and widening wealth disparities.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"materialism\"; and","B":"materialism\" and","C":"materialism,\"","D":"materialism\""}'::jsonb, NULL, 'C', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '1-26', 26, 'mcq', 'To humans, it does not appear that the golden orb-weaver spider uses camouflage to capture its ______ the brightly colored arachnid seems to wait conspicuously in the center of its large circular web for insects to approach. Researcher Po Peng of the University of Melbourne has explained that the spider''s distinctive coloration may in fact be part of its appeal.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"prey, rather,","B":"prey rather,","C":"prey, rather;","D":"prey; rather,"}'::jsonb, NULL, 'D', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '1-27', 27, 'mcq', 'In Death Valley National Park''s Racetrack Playa, a flat, dry lakebed, are 162 rocks—some weighing less than a pound but others almost 700 pounds—that move periodically from place to place, seemingly of their own volition. Racetrack like trails in the ______ mysterious migration.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"playas sediment mark the rock''s","B":"playa''s sediment mark the rocks","C":"playa''s sediment mark the rocks''","D":"playas'' sediment mark the rocks''"}'::jsonb, NULL, 'C', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 28, '1-28', 28, 'mcq', 'In crafting her fantasy fiction, Nigerian-born British author Helen Oyeyemi has drawn inspiration from the classic nineteenth-century fairy tales of the Brothers Grimm. Her 2014 novel <i>Boy, Snow, Bird</i>, for instance, is a complex retelling of the story of Snow White, while her 2019 novel ______ offers a delicious twist on the classic tale of Hansel and Gretel.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"<i>Gingerbread</i>—","B":"<i>Gingerbread</i>,","C":"<i>Gingerbread</i>","D":"<i>Gingerbread</i>:"}'::jsonb, NULL, 'C', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 29, '1-29', 29, 'mcq', 'While researching a topic, a student has taken the following notes:

- NASA uses rovers, large remote vehicles with wheels, to explore the surface of Mars.
- NASA''s rovers can''t explore regions inaccessible to wheeled vehicles.
- Rovers are also heavy, making them difficult to land on the planet''s surface.
- Microprobes, robotic probes that weigh as little as 50 milligrams, could be deployed virtually anywhere on the surface of Mars.
- Microprobes have been proposed as an alternative to rovers.

The student wants to explain an advantage of microprobes. Which choice most effectively uses relevant information from the notes to accomplish this goal?', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Despite being heavy, NASA''s rovers can land successfully on the surface of Mars.","B":"Microprobes, which weigh as little as 50 milligrams, could explore areas of Mars that are inaccessible to NASA''s heavy, wheeled rovers.","C":"NASA currently uses its rovers on Mars, but microprobes have been proposed as an alternative.","D":"Though they are different sizes, both microprobes and rovers can be used to explore the surface of Mars."}'::jsonb, NULL, 'B', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 30, '1-30', 30, 'mcq', 'While researching a topic, a student has taken the following notes:

- Abdulrazak Gurnah was awarded the 2021 Nobel Prize in Literature.
- Gurnah was born in Zanzibar in East Africa and currently lives in the United Kingdom.
- Many readers have singled out Gurnah''s 1994 book <i>Paradise</i> for praise.
- <i>Paradise</i> is a historical novel about events that occurred in colonial East Africa.

The student wants to introduce <i>Paradise</i> to an audience unfamiliar with the novel and its author. Which choice most effectively uses relevant information from the notes to accomplish this goal?', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Abdulrazak Gurnah, who wrote <i>Paradise</i> and later was awarded the Nobel Prize in Literature, was born in Zanzibar in East Africa and currently lives in the United Kingdom.","B":"Many readers have singled out Abdulrazak Gurnah''s 1994 book <i>Paradise</i>, a historical novel about colonial East Africa, for praise.","C":"A much-praised historical novel about colonial East Africa, <i>Paradise</i> (1994) was written by Abdulrazak Gurnah, winner of the 2021 Nobel Prize in Literature.","D":"<i>Paradise</i> is a historical novel about events that occurred in colonial East Africa, Abdulrazak Gurnah’s homeland."}'::jsonb, NULL, 'C', NULL, NULL, 16)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 31, '1-31', 31, 'mcq', 'While researching a topic, a student has taken the following notes:

- Ulaanbaatar is the capital of Mongolia.
- The city''s population is 907,802.
- Ulaanbaatar contains 31.98 percent of Mongolia''s population.
- Hanoi is the capital of Vietnam.
- The city''s population is 7,781,631.
- Hanoi contains 8.14 percent of Vietnam''s population.', NULL, 'Which choice most effectively uses information from the given sentences to emphasize the relative sizes of the two capitals'' populations?', '{"A":"Mongolia''s capital is Ulaanbaatar, which has 907,802 people, and Vietnam''s capital is Hanoi, which has 7,781,631 people.","B":"The populations of the capitals of Mongolia and Vietnam are 907,802 (Ulaanbaatar) and 7,781,631 (Hanoi), respectively.","C":"Even though Hanoi (population 7,781,631) is larger than Ulaanbaatar (population 907,802), Ulaanbaatar accounts for more of its country''s population.","D":"Comparing Vietnam and Mongolia, 7,781,631 is 8.14 percent of Vietnam’s population, and 907,802 is 31.98 percent of Mongolia’s."}'::jsonb, NULL, 'C', NULL, NULL, 16)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 32, '1-32', 32, 'mcq', 'While researching a topic, a student has taken the following notes:

- One of history''s greatest libraries was the House of Wisdom in Baghdad, Iraq.
- It was founded in the eighth century with the goal of preserving all the world''s knowledge.
- Scholars at the House of Wisdom collected ancient and contemporary texts from Greece, India, and elsewhere and translated them into Arabic.
- Writings included those of Greek philosopher Aristotle and the Indian mathematician Aryabhata.

The student wants to explain how the House of Wisdom preserved the world''s knowledge. Which choice most effectively uses relevant information from the notes to accomplish this goal?', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"<i>The House of Wisdom</i> was known for bringing together knowledge from around the world, including from Greece, India, and China.","B":"Founded in Iraq in the eighth century, the House of Wisdom employed many scholars as translators.","C":"Writings from the Greek philosopher Aristotle and the Indian mathematician Aryabhata were preserved at the House of Wisdom.","D":"<i>The House of Wisdom</i> collected writings from different countries and created paper versions in Arabic to be studied and shared."}'::jsonb, NULL, 'D', NULL, NULL, 17)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 33, '1-33', 33, 'mcq', 'While researching a topic, a student has taken the following notes:

- British musicians John Lennon and Paul McCartney shared writing credit for numerous Beatles songs.
- Many Lennon-McCartney songs were actually written by either Lennon or McCartney, not by both.
- The exact authorship of specific parts of many Beatles songs, such as the verse for "In My Life," is disputed.
- Mark Glickman, Jason Brown, and Ryan Song used statistical methods to analyze the musical content of Beatles songs.
- They concluded that there is 18.9% probability that McCartney wrote the verse for "In My Life," stating that the verse is "consistent with Lennon''s songwriting style."

The student wants to make a generalization about the kind of study conducted by Glickman, Brown, and Song. Which choice most effectively uses relevant information from the notes to accomplish this goal?', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Based on statistical analysis, Glickman, Brown, and Song claim that John Lennon wrote the verse of \"In My Life.\"","B":"There is only an 18.9% probability that Paul McCartney wrote the verse for \"In My Life\"; John Lennon is the more likely author.","C":"It is likely that John Lennon, not Paul McCartney, wrote the verse for \"In My Life.\"","D":"Researchers have used statistical methods to address questions of authorship within the field of music."}'::jsonb, NULL, 'D', NULL, NULL, 17)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 2, 'reading-writing', 'Reading and Writing — Module 2', 1920, 33)
  ON CONFLICT (test_id, position) DO UPDATE SET section=EXCLUDED.section, label=EXCLUDED.label,
    time_limit_seconds=EXCLUDED.time_limit_seconds, question_count=EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '2-1', 1, 'mcq', '<i>The Mule Bone</i>, a 1930 play written by Zora Neale Hurston and Langston Hughes, is perhaps the best-known of the few examples of ______ in literature. Most writers prefer working alone, and given that working together cost Hurston and Hughes their friendship, it is not hard to see why.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"characterization","B":"interpretation","C":"collaboration","D":"commercialization"}'::jsonb, NULL, 'C', NULL, NULL, 16)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '2-2', 2, 'mcq', 'The process of mechanically recycling plastics is often considered ______ because of the environmental impact and the loss of material quality that often occurs. But chemist Takunda Chazovachii has helped develop a cleaner process of chemical recycling that converts superabsorbent polymers from diapers into a desirable reusable adhesive.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"resilient","B":"inadequate","C":"dynamic","D":"satisfactory"}'::jsonb, NULL, 'B', NULL, NULL, 16)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '2-3', 3, 'mcq', 'Interruptions in the supply chain for microchips used in personal electronics have challenged an economist''s assertion that retailers can expect robust growth in sales of those devices in the coming months. The delays are unlikely to ______ her projection entirely but will almost certainly extend its time frame.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"dispute","B":"withdraw","C":"underscore","D":"invalidate"}'::jsonb, NULL, 'D', NULL, NULL, 17)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '2-4', 4, 'mcq', 'For her 2021 art installation <i>Anthem</i>, Wu Tsang joined forces with singer and composer Beverly Glenn-Copeland to produce a piece that critics found truly ______: they praised Tsang for creatively transforming a museum rotunda into a dynamic exhibit by projecting filmed images of Glenn-Copeland onto a massive 84-foot curtain and filling the space with the sounds of his and other voices singing.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"restrained","B":"inventive","C":"inexplicable","D":"mystifying"}'::jsonb, NULL, 'B', NULL, NULL, 17)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '2-5', 5, 'mcq', 'Some scientists have suggested that mammals in the Mesozoic era were not a very ______ group, but paleontologist Zhe-Xi Luo''s research suggests that early mammals living in the shadow of dinosaurs weren''t all ground-dwelling insectivores. Fossils of various plant-eating mammals have been found in China, including species like <i>Vilevolodon diplomylos</i>, which Luo says could glide like a flying squirrel.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"predatory","B":"obscure","C":"diverse","D":"localized"}'::jsonb, NULL, 'C', NULL, NULL, 17)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '2-6', 6, 'mcq', 'The following text is adapted from Gwendolyn Bennett''s 1926 poem "Street Lamps in Early Spring."

Night wears a garment
All velvet soft, all violet blue. . .
And over her face she draws a veil
As shimmering fine as floating dew. . .
And here and there
In the black of her hair
The subtle hands of Night
Move slowly with their gem-starred light.', NULL, 'Which choice best describes the overall structure of the text?', '{"A":"It presents alternating descriptions of night in a rural area and in a city.","B":"It sketches an image of nightfall, then an image of sunrise.","C":"It makes an extended comparison of night to a human being.","D":"It portrays how night changes from one season of the year to the next."}'::jsonb, NULL, 'C', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '2-7', 7, 'mcq', 'According to historian Vicki L. Ruiz, Mexican American women made crucial contributions to the labor movement during World War II. At the time, food processing companies entered into contracts to supply the United States armed forces with canned goods. Increased production quotas conferred greater bargaining power on the companies'' employees, many of whom were Mexican American women: <u>employees insisted on more favorable benefits, and employers, who were anxious to fulfill the contracts, complied.</u> Thus, labor activism became a platform for Mexican American women to assert their agency.', NULL, 'Which choice best describes the function of the underlined portion in the text as a whole?', '{"A":"It elaborates on a claim about labor relations in a particular industry made earlier in the text.","B":"It offers an example of a trend in the World War II–era economy discussed earlier in the text.","C":"It notes a possible exception to the historical narrative of labor activism sketched earlier in the text.","D":"It provides further details about the identities of the workers discussed earlier in the text."}'::jsonb, NULL, 'A', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '2-8', 8, 'mcq', 'The following text is adapted from Zora Neale Hurston''s 1921 short story "John Redding Goes to Sea." John is a child who lives in a town in the woods.

Perhaps ten-year-old John was puzzling to the folk there in the Florida woods for he was an imaginative child and fond of day-dreams. The St. John River flowed a scarce three hundred feet from his back door. On its banks at this point grow numerous palms, luxuriant magnolias and bay trees. On the bosom of the stream float millions of delicately colored hyacinths. <u>[John Redding] loved to wander down to the water''s edge, and, casting in dry twigs, watch them sail away down stream to Jacksonville, the sea, the wide world and [he] wanted to follow them.</u>', NULL, 'Which choice best describes the function of the underlined sentence in the text as a whole?', '{"A":"It provides an extended description of a location that John likes to visit.","B":"It reveals that some residents of John''s town are confused by his behavior.","C":"It illustrates the uniqueness of John''s imagination compared to the imaginations of other children.","D":"It suggests that John longs to experience a larger life outside the Florida woods."}'::jsonb, NULL, 'D', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '2-9', 9, 'mcq', 'The following text is adapted from Oscar Wilde''s 1891 novel <i>The Picture of Dorian Gray</i>. Dorian Gray is taking his first look at a portrait that Hallward has painted of him.

Dorian passed listlessly in front of his picture and turned towards it. When he saw it he drew back, and his cheeks flushed for a moment with pleasure. A look of joy came into his eyes, as if he had recognized himself for the first time. He stood there motionless and in wonder, dimly conscious that Hallward was speaking to him, but not catching the meaning of his words. The sense of his own beauty came on him like a revelation. He had never felt it before.', NULL, 'According to the text, what is true about Dorian?', '{"A":"He wants to know Hallward''s opinion of the portrait.","B":"He is delighted by what he sees in the portrait.","C":"He prefers portraits to other types of paintings.","D":"He is uncertain of Hallward''s talent as an artist."}'::jsonb, NULL, 'B', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '2-10', 10, 'mcq', '[Figure: bar graph titled "Voters'' Political Orientation, Level of Political Information, and Probability of Voting." Y-axis: Probability of voting (%), 0 to 100. X-axis: Voters'' political orientation (1 = strong Democrat/liberal, 4 = independent, 7 = strong Republican/conservative), categories 1 through 7. Two series: low information, high information.]

Economists Kerwin Kofi Charles and Melvin Stephens Jr. investigated a variety of factors that influence voter turnout in the United States. Using survey data that revealed whether respondents voted in national elections and how knowledgeable respondents are about politics, Charles and Stephens claim that the likelihood of voting is driven in part by potential voters'' confidence in their assessments of candidates—essentially, the more informed voters are about politics, the more confident they are at evaluating whether candidates share their views, and thus the more likely they are to vote.', 'Bar graph: Voters'' Political Orientation, Level of Political Information, and Probability of Voting. Y-axis Probability of voting (%) 0–100; X-axis Voters'' political orientation (1 = strong Democrat/liberal, 4 = independent, 7 = strong Republican/conservative), values 1–7. Two series: low information, high information.', 'Which choice best describes data in the graph that support Charles and Stephens''s claim?', '{"A":"At each point on the political orientation scale, high-information voters were more likely than low-information voters to vote.","B":"Only low-information voters who identify as independents had a voting probability below 50%.","C":"The closer that low-information voters are to the ends of the political orientation scale, the more likely they were to vote.","D":"High-information voters were more likely to identify as strong Democrats or strong Republicans than low-information voters were."}'::jsonb, '/data/tests/cb-og-2/figures/m2-q10.png', 'A', NULL, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '2-11', 11, 'mcq', '[Figure: bar graph titled "Spider Population Count." Y-axis: Spider count, 0 to 90. X-axis: Day of experiment, values 1, 10, 20, 30. Two series: no lizards, with lizards.]

To investigate the effect of lizard predation on spider populations, a student in a biology class placed spiders in two enclosures, one with lizards and one without, and tracked the number of spiders in the enclosures for 30 days. The student concluded that the reduction in the spider population count in the enclosure with lizards by day 30 was entirely attributable to the presence of the lizards.', 'Bar graph: Spider Population Count. Y-axis Spider count 0–90; X-axis Day of experiment values 1, 10, 20, 30. Two series: no lizards, with lizards.', 'Which choice best describes the data from the graph that weaken the student''s conclusion?', '{"A":"The spider population count was the same in both enclosures on day 1.","B":"The spider population count also substantially declined by day 30 in the enclosure without lizards.","C":"The largest decline in spider population count in the enclosure with lizards occurred from day 1 to day 10.","D":"The spider population count on day 30 was lower in the enclosure with lizards than in the enclosure without lizards."}'::jsonb, '/data/tests/cb-og-2/figures/m2-q11.png', 'B', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '2-12', 12, 'mcq', 'Archaeologist Petra Vaiglova, anthropologist Xinyi Liu, and their colleagues investigated the domestication of farm animals in China during the Bronze Age (approximately 2000 to 1000 BCE). By analyzing the chemical composition of the bones of sheep, goats, and cattle from this era, the team determined that wild plants made up the bulk of sheep''s and goats'' diets, while the cattle''s diet consisted largely of millet, a crop cultivated by humans. The team concluded that cattle were likely raised closer to human settlements, whereas sheep and goats were allowed to roam farther away.', NULL, 'Which finding, if true, would most strongly support the team''s conclusion?', '{"A":"Analysis of the animal bones showed that the cattle''s diet also consisted of wheat, which humans widely cultivated in China during the Bronze Age.","B":"Further investigation of sheep and goat bones revealed that their diets consisted of small portions of millet as well.","C":"Cattle''s diets generally require larger amounts of food and a greater variety of nutrients than do sheep''s and goats'' diets.","D":"The diets of sheep, goats, and cattle were found to vary based on what the farmers in each Bronze Age settlement could grow."}'::jsonb, NULL, 'A', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '2-13', 13, 'mcq', 'Mosasaurs were large marine reptiles that lived in the Late Cretaceous period, approximately 100 million to 66 million years ago. Celina Suarez, Alberto Pérez-Huerta, and T. Lynn Harrell Jr. examined oxygen-18 isotopes in mosasaur tooth enamel in order to calculate likely mosasaur body temperatures and determined that mosasaurs were endothermic—that is, they used internal metabolic processes to maintain a stable body temperature in a variety of ambient temperatures. Suarez, Pérez-Huerta, and Harrell claim that endothermy would have enabled mosasaurs to include relatively cold polar waters in their range.', NULL, 'Which finding, if true, would most directly support Suarez, Pérez-Huerta, and Harrell''s claim?', '{"A":"Mosasaurs'' likely body temperatures are easier to determine from tooth enamel oxygen-18 isotope data than the body temperatures of nonendothermic Late Cretaceous marine reptiles are.","B":"Fossils of both mosasaurs and nonendothermic marine reptiles have been found in roughly equal numbers in regions known to be near the poles during the Late Cretaceous, though in lower concentrations than elsewhere.","C":"Several mosasaur fossils have been found in regions known to be near the poles during the Late Cretaceous, while relatively few fossils of nonendothermic marine reptiles have been found in those locations.","D":"During the Late Cretaceous, seawater temperatures were likely higher throughout mosasaurs'' range, including near the poles, than seawater temperatures at those same latitudes are today."}'::jsonb, NULL, 'C', NULL, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '2-14', 14, 'mcq', 'Researchers hypothesized that a decline in the population of dusky sharks near the mid-Atlantic coast of North America led to a decline in the population of eastern oysters in the region. Dusky sharks do not typically consume eastern oysters but do consume cownose rays, which are the main predators of the oysters.', NULL, 'Which finding, if true, would most directly support the researchers'' hypothesis?', '{"A":"Declines in the regional abundance of dusky sharks'' prey other than cownose rays are associated with regional declines in dusky shark abundance.","B":"Eastern oyster abundance tends to be greater in areas with both dusky sharks and cownose rays than in areas with only dusky sharks.","C":"Consumption of eastern oysters by cownose rays in the region substantially increased before the regional decline in dusky shark abundance began.","D":"Cownose rays have increased in regional abundance as dusky sharks have decreased in regional abundance."}'::jsonb, NULL, 'D', NULL, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '2-15', 15, 'mcq', 'Political scientists who favor the traditional view of voter behavior claim that voting in an election does not change a voter''s attitude toward the candidates in that election. Focusing on each US presidential election from 1976 to 1996, Ebonya Washington and Sendhil Mullainathan tested this claim by distinguishing between subjects who had just become old enough to vote (around half of whom actually voted) and otherwise similar subjects who were slightly too young to vote (and thus none of whom voted). Washington and Mullainathan compared the attitudes of the groups of subjects toward the winning candidate two years after each election.', NULL, 'Which finding from Washington and Mullainathan''s study, if true, would most directly weaken the claim made by people who favor the traditional view of voter behavior?', '{"A":"Subjects'' attitudes toward the winning candidate two years after a given election were strongly predicted by subjects'' general political orientation, regardless of whether subjects were old enough to vote at the time of the election.","B":"Subjects who were not old enough to vote in a given election held significantly more positive attitudes towards the winning candidate two years later than they held at the time of the election.","C":"Subjects who voted in a given election held significantly more polarized attitudes toward the winning candidate two years later than did subjects who were not old enough to vote in that election.","D":"Two years after a given election, subjects who voted and subjects who were not old enough to vote were significantly more likely to express negative attitudes than positive attitudes toward the winning candidate in that election."}'::jsonb, NULL, 'C', NULL, NULL, 23)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '2-16', 16, 'mcq', '[Figure: bar graph titled "Power Conversion Efficiency of Lowest and Highest Performing Spin-coated and Spray-coated Electron Transport Layers." Y-axis: Power conversion efficiency (%), 0 to 16. X-axis: Thickness, categories "lower performing" and "higher performing." Two series: spray coating, spin coating.]

Perovskite solar cells convert light into electricity more efficiently than earlier kinds of solar cells, and manufacturing advances have recently made them commercially attractive. One limitation of the cells, however, has to do with their electron transport layer (ETL), through which absorbed electrons must pass. Often the ETL is applied through a process called spin coating, but such ETLs are fairly inefficient at converting input power to output power. André Taylor and colleagues tested a novel spray coating method for applying the ETL. The team produced ETLs of various thicknesses and concluded that spray coating holds promise for improving the power conversion efficiency of ETLs in perovskite solar cells.', 'Bar graph: Power Conversion Efficiency of Lowest and Highest Performing Spin-coated and Spray-coated Electron Transport Layers. Y-axis Power conversion efficiency (%) 0–16; X-axis Thickness, categories lower performing and higher performing. Two series: spray coating, spin coating.', 'Which choice best describes data from the graph that support Taylor and colleagues'' conclusion?', '{"A":"Both the ETL applied through spin coating and the ETL applied through spray coating showed a power conversion efficiency greater than 10% at their lowest performing thickness.","B":"The lowest performing ETL applied through spray coating had a higher power conversion efficiency than the highest performing ETL applied through spin coating.","C":"The highest performing ETL applied through spray coating showed a power conversion efficiency of approximately 13%, while the highest performing ETL applied through spin coating showed a power conversion efficiency of approximately 11%.","D":"There was a substantial difference in power conversion efficiency between the lowest and highest performing ETLs applied through spray coating."}'::jsonb, '/data/tests/cb-og-2/figures/m2-q16.png', 'B', NULL, NULL, 24)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '2-17', 17, 'mcq', 'While attending school in New York City in the 1980s, Okwui Enwezor encountered few works by African artists in exhibitions, despite New York''s reputation as one of the best places to view contemporary art from around the world. According to an arts journalist, later in his career as a renowned curator and art historian, Enwezor sought to remedy this deficiency, not by focusing solely on modern African artists, but by showing how their work fits into the larger context of global modern art and art history.', NULL, 'Which choice, if true, would most directly support the journalist''s claim?', '{"A":"As curator of the Haus der Kunst in Munich, Germany, Enwezor organized a retrospective of Ghanaian sculptor El Anatsui''s work entitled El Anatsui: Triumphant Scale, one of the largest art exhibitions devoted to a Black artist in Europe''s history.","B":"In the exhibition Postwar: Art Between the Pacific and the Atlantic, 1945–1965, Enwezor and cocurator Katy Siegel brought works by African artists such as Malangatana Ngwenya together with pieces by major figures from other countries, like US artist Andy Warhol and Mexico’s David Siqueiros.","C":"Enwezor''s work as curator of the 2001 exhibition The Short Century: Independence and Liberation Movements in Africa, 1945–1994 showed how African movements for independence from European colonial powers following the Second World War profoundly influenced work by African artists of the period, such as Kamala Ibrahim Ishaq and Thomas Mukarobgwa.","D":"Enwezor organized the exhibition In/sight: African Photographers, 1940 to the Present not to emphasize a particular aesthetic trend but to demonstrate the broad range of ways in which African artists have approached the medium of photography."}'::jsonb, NULL, 'B', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '2-18', 18, 'mcq', 'For thousands of years, people in the Americas ______ the bottle gourd, a large bitter fruit with a thick rind, to make bottles, other types of containers, and even musical instruments. Oddly, there is no evidence that any type of bottle gourd is native to the Western Hemisphere; either the fruit or its seeds must have somehow been carried from Asia or Africa.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"to use","B":"have used","C":"having used","D":"using"}'::jsonb, NULL, 'B', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '2-19', 19, 'mcq', 'While many video game creators strive to make their graphics ever more ______, others look to the past, developing titles with visuals inspired by the "8-bit" games of the 1980s and 1990s. (The term "8-bit" refers to a console whose processor could only handle eight bits of data at once.)', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"lifelike but","B":"lifelike","C":"lifelike,","D":"lifelike, but"}'::jsonb, NULL, 'C', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '2-20', 20, 'mcq', 'In the 1950s, a man named Joseph McVicker was struggling to keep his business afloat when his sister-in-law Kay Zufall advised him to repurpose the company''s product, a nontoxic, clay-like substance for removing soot from wallpaper, as a modeling putty for kids. In addition, Zufall ______ selling the product under a child-friendly name: Play-Doh.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"suggested","B":"suggests","C":"had suggested","D":"was suggesting"}'::jsonb, NULL, 'A', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '2-21', 21, 'mcq', 'Beatrix Potter is perhaps best known for writing and illustrating children''s books such as <i>The Tale of</i> <i>Peter Rabbit</i> (1902), but she also dedicated herself to mycology, the study of ______ more than 350 paintings of fungal species she observed in nature and submitting her research on spore germination to the Linnean Society of London.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"fungi; producing","B":"fungi. Producing","C":"fungi producing","D":"fungi, producing"}'::jsonb, NULL, 'D', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '2-22', 22, 'mcq', 'In assessing the films of Japanese director Akira Kurosawa, ______ have missed his equally deep engagement with Japanese artistic traditions such as Noh theater.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"many critics have focused on Kurosawa''s use of Western literary sources but","B":"Kurosawa''s use of Western literary sources has been the focus of many critics, who","C":"there are many critics who have focused on Kurosawa''s use of Western literary sources, but they","D":"the focus of many critics has been on Kurosawa’s use of Western literary sources; they"}'::jsonb, NULL, 'A', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '2-23', 23, 'mcq', 'Joshua Hinson, director of the language revitalization program of the Chickasaw Nation in Oklahoma, helped produce the world''s first Indigenous-language instructional app, Chickasaw ______ Chickasaw TV, in 2010, and a Rosetta Stone language course in Chickasaw, in 2015.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"Basic; in 2009, an online television network;","B":"Basic; in 2009, an online television network,","C":"Basic, in 2009; an online television network,","D":"Basic, in 2009, an online television network,"}'::jsonb, NULL, 'C', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '2-24', 24, 'mcq', 'The forty-seven geothermal springs of Arkansas'' Hot Springs National Park are sourced via a process known as natural groundwater recharge, in which rainwater percolates downward through the earth—in this case, the porous rocks of the hills around Hot ______ collect in a subterranean basin.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"Springs to","B":"Springs: to","C":"Springs—to","D":"Springs, to"}'::jsonb, NULL, 'C', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '2-25', 25, 'mcq', 'Over twenty years ago, in a landmark experiment in the psychology of choice, professor Sheena Iyengar set up a jam-tasting booth at a grocery store. The number of jams available for tasting ______ some shoppers had twenty-four different options, others only six. Interestingly, the shoppers with fewer jams to choose from purchased more jam.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"varied:","B":"varied,","C":"varied, while","D":"varied while"}'::jsonb, NULL, 'A', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '2-26', 26, 'mcq', 'Nigerian author Buchi Emecheta''s celebrated literary oeuvre includes <i>The Joys of Motherhood</i>, a novel about the changing roles of women in 1950s ______ a television play about the private struggles of a newlywed couple in Nigeria; and <i>Head Above Water</i>, her autobiography.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"Lagos, <i>A Kind of Marriage</i>,","B":"Lagos; <i>A Kind of Marriage</i>,","C":"Lagos, <i>A Kind of Marriage</i>:","D":"Lagos; <i>A Kind of Marriage</i>"}'::jsonb, NULL, 'B', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '2-27', 27, 'mcq', 'Chimamanda Ngozi Adichie''s 2013 novel <i>Americanah</i> chronicles the divergent experiences of Ifemelu and Obinze, a young Nigerian couple, after high school. Ifemelu moves to the United States to attend a prestigious university. ______ Obinze travels to London, hoping to start a career there. However, frustrated with the lack of opportunities, he soon returns to Nigeria.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Meanwhile,","B":"Nevertheless,","C":"Secondly,","D":"In fact,"}'::jsonb, NULL, 'A', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 28, '2-28', 28, 'mcq', 'Organisms have evolved a number of surprising adaptations to ensure their survival in adverse conditions. Tadpole shrimp (<i>Triops longicaudatus</i>) embryos, ______ can pause development for over ten years during extended periods of drought.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"in contrast,","B":"for example,","C":"meanwhile,","D":"consequently,"}'::jsonb, NULL, 'B', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 29, '2-29', 29, 'mcq', 'In 1933, the Twentieth Amendment to the US Constitution was ratified. The amendment mandates that presidential inaugurations be held on January 20, approximately ten weeks after the November election. ______ this amendment requires newly elected US senators and representatives to be sworn into their respective offices on January 3.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Instead,","B":"For instance,","C":"Specifically,","D":"In addition,"}'::jsonb, NULL, 'D', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 30, '2-30', 30, 'mcq', 'In her poetry collection <i>Thomas and Beulah</i>, Rita Dove interweaves the titular characters'' personal stories with broader historical narratives. She places Thomas''s journey from the American South to the Midwest in the early 1900s within the larger context of the Great Migration. ______ Dove sets events from Beulah''s personal life against the backdrop of the US Civil Rights Movement.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Specifically,","B":"Thus,","C":"Regardless,","D":"Similarly,"}'::jsonb, NULL, 'D', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 31, '2-31', 31, 'mcq', 'While researching a topic, a student has taken the following notes:

- The Philadelphia and Lancaster Turnpike was a road built between 1792 and 1794.
- It was the first private turnpike in the United States.
- It connected the cities of Philadelphia and Lancaster in the state of Pennsylvania.
- It was sixty-two miles long.

The student wants to emphasize the distance covered by the Philadelphia and Lancaster Turnpike. Which choice most effectively uses relevant information from the notes to accomplish this goal?', NULL, 'The student wants to emphasize the distance covered by the Philadelphia and Lancaster Turnpike. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"The sixty-two-mile-long Philadelphia and Lancaster Turnpike connected the Pennsylvania cities of Philadelphia and Lancaster.","B":"The Philadelphia and Lancaster Turnpike was the first private turnpike in the United States.","C":"The Philadelphia and Lancaster Turnpike, which connected two Pennsylvania cities, was built between 1792 and 1794.","D":"A historic Pennsylvania road, the Philadelphia and Lancaster Turnpike was completed in 1794."}'::jsonb, NULL, 'A', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 32, '2-32', 32, 'mcq', 'While researching a topic, a student has taken the following notes:

- Most, but not all, of the Moon''s oxygen comes from the Sun, via solar wind.
- Cosmochemist Kentaro Terada of Osaka University wondered if some of the unaccounted-for oxygen could be coming from Earth.
- In 2008, he analyzed data from the Japanese satellite Kaguya.
- Kaguya gathered data about gases and particles it encountered while orbiting the Moon.
- Based on the Kaguya data, Terada confirmed his suspicion that Earth is sending oxygen to the Moon.

The student wants to emphasize the aim of the research study. Which choice most effectively uses relevant information from the notes to accomplish this goal?', NULL, 'The student wants to emphasize the aim of the research study. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"As it orbited the Moon, the Kaguya satellite collected data that was later analyzed by cosmochemist Kentaro Terada.","B":"Before 2008, Kentaro Terada wondered if the Moon was receiving some of its oxygen from Earth.","C":"Cosmochemist Kentaro Terada set out to determine whether some of the Moon''s oxygen was coming from Earth.","D":"Kentaro Terada''s study determined that Earth is sending a small amount of oxygen to the Moon."}'::jsonb, NULL, 'C', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 33, '2-33', 33, 'mcq', 'While researching a topic, a student has taken the following notes:

- Ducklings expend up to 62.8% less energy when swimming in a line behind their mother than when swimming alone.
- The physics behind this energy savings hasn''t always been well understood.
- Naval architect Zhiming Yuan used computer simulations to study the effect of the mother duck''s wake.
- The study revealed that ducklings are pushed in a forward direction by the wake''s waves.
- Yuan determined this push reduces the effect of wave drag on ducklings by 158%.

The student wants to present the study and its methodology. Which choice most effectively uses relevant information from the notes to accomplish this goal?', NULL, 'The student wants to present the study and its methodology. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"A study revealed that ducklings, which expend up to 62.8% less energy when swimming in a line behind their mother, also experience 158% less drag.","B":"Seeking to understand how ducklings swimming in a line behind their mother save energy, Zhiming Yuan used computer simulations to study the effect of the mother duck''s wake.","C":"Zhiming Yuan studied the physics behind the fact that by being pushed in a forward direction by waves, ducklings save energy.","D":"Naval architect Zhiming Yuan discovered that ducklings are pushed in a forward direction by the waves of their mother''s wake, reducing the effect of drag by 158%."}'::jsonb, NULL, 'B', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 3, 'math', 'Math — Module 1', 2100, 27)
  ON CONFLICT (test_id, position) DO UPDATE SET section=EXCLUDED.section, label=EXCLUDED.label,
    time_limit_seconds=EXCLUDED.time_limit_seconds, question_count=EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '3-1', 1, 'mcq', 'The line graph shows the percent of cars for sale at a used car lot on a given day by model year.', 'Line graph titled with x-axis labeled "Model year" showing years 2010 through 2019, and y-axis labeled "Percent of cars for sale" with gridlines at 0%, 5%, 10%, 15%. The plotted points are approximately: 2010 = 12%, 2011 = 12%, 2012 = 12%, 2013 = 8%, 2014 = 4% (the lowest point), 2015 = 9%, 2016 = 10%, 2017 = 10%, 2018 = 11%, 2019 = 11%. Consecutive points are connected by line segments.', 'For what model year is the percent of cars for sale the smallest?', '{"A":"2012","B":"2013","C":"2014","D":"2015"}'::jsonb, '/data/tests/cb-og-2/figures/m3-q1.png', 'C', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '3-2', 2, 'mcq', NULL, NULL, 'For a particular machine that produces beads, 29 out of every 100 beads it produces have a defect. A bead produced by the machine will be selected at random. What is the probability of selecting a bead that has a defect?', '{"A":"$\\dfrac{1}{2{,}900}$","B":"$\\dfrac{1}{29}$","C":"$\\dfrac{29}{100}$","D":"$\\dfrac{29}{10}$"}'::jsonb, NULL, 'C', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '3-3', 3, 'mcq', 'Note: Figure not drawn to scale.', 'Two vertical parallel lines labeled m (left) and n (right). A transversal line t slants downward from upper-left to lower-right, crossing line m and then line n. At the intersection of t with line m, the angle labeled x° is marked (on the left side, below the transversal). At the intersection of t with line n, an angle of 33° is marked (to the right, above where t exits below line n). Note: Figure not drawn to scale.', 'In the figure, line $m$ is parallel to line $n$, and line $t$ intersects both lines. What is the value of $x$ ?', '{"A":"33","B":"57","C":"123","D":"147"}'::jsonb, '/data/tests/cb-og-2/figures/m3-q3.png', 'D', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '3-4', 4, 'mcq', NULL, 'An xy-plane with both axes labeled and a grid. The x-axis is marked from -10 to 10 and the y-axis is marked from 2 to 14 (gridlines at 2, 4, 6, 8, 10, 12, 14). An increasing exponential-type curve is shown: it is nearly flat near y = 6 for large negative x, passes through the y-axis at the point (0, 8), and rises steeply upward to the right, exceeding y = 14 near x = 4.', 'What is the $y$-intercept of the graph shown?', '{"A":"$(-8, 0)$","B":"$(-6, 0)$","C":"$(0, 6)$","D":"$(0, 8)$"}'::jsonb, '/data/tests/cb-og-2/figures/m3-q4.png', 'D', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '3-5', 5, 'mcq', NULL, NULL, 'The total cost $f(x)$, in dollars, to lease a car for 36 months from a particular car dealership is given by $f(x) = 36x + 1{,}000$, where $x$ is the monthly payment, in dollars. What is the total cost to lease a car when the monthly payment is \$400?', '{"A":"\\$13,400","B":"\\$13,000","C":"\\$15,400","D":"\\$37,400"}'::jsonb, NULL, 'C', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '3-6', 6, 'grid', NULL, NULL, 'Each side of a square has a length of 45. What is the perimeter of this square?', NULL, NULL, '180', '["180"]'::jsonb, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '3-7', 7, 'grid', NULL, NULL, '$\dfrac{55}{x + 6} = x$

What is the positive solution to the given equation?', NULL, NULL, '5', '["5"]'::jsonb, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '3-8', 8, 'mcq', NULL, NULL, 'An object travels at a constant speed of 12 centimeters per second. At this speed, what is the time, in seconds, that it would take for the object to travel 108 centimeters?', '{"A":"9","B":"96","C":"120","D":"972"}'::jsonb, NULL, 'A', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '3-9', 9, 'mcq', 'Data set X: 5, 9, 9, 13
Data set Y: 5, 9, 9, 13, 27', NULL, 'The lists give the values in data sets X and Y. Which statement correctly compares the mean of data set X and the mean of data set Y?', '{"A":"The mean of data set X is greater than the mean of data set Y.","B":"The mean of data set X is less than the mean of data set Y.","C":"The means of data set X and data set Y are equal.","D":"There is not enough information to compare the means."}'::jsonb, NULL, 'B', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '3-10', 10, 'mcq', NULL, NULL, 'A rocket contained 467,000 kilograms (kg) of propellant before launch. Exactly 21 seconds after launch, 362,105 kg of this propellant remained. On average, approximately how much propellant, in kg, did the rocket burn each second after launch?', '{"A":"4,995","B":"17,243","C":"39,481","D":"104,895"}'::jsonb, NULL, 'A', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '3-11', 11, 'mcq', NULL, NULL, 'If $4x + 2 = 12$, what is the value of $16x + 8$ ?', '{"A":"40","B":"48","C":"56","D":"60"}'::jsonb, NULL, 'B', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '3-12', 12, 'mcq', NULL, NULL, 'An object is kicked from a platform. The equation $h = -4.9t^2 + 7t + 9$ represents this situation, where $h$ is the height of the object above the ground, in meters, $t$ seconds after it is kicked. Which number represents the height, in meters, from which the object was kicked?', '{"A":"0","B":"4.9","C":"7","D":"9"}'::jsonb, NULL, 'D', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '3-13', 13, 'grid', NULL, NULL, '$f(x) = 4x^2 - 50x + 126$

The given equation defines the function $f$. For what value of $x$ does $f(x)$ reach its minimum?', NULL, NULL, '25/4', '["25/4","6.25"]'::jsonb, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '3-14', 14, 'grid', NULL, NULL, 'A small business owner budgets \$2,200 to purchase candles. The owner must purchase a minimum of 200 candles to maintain the discounted pricing. If the owner pays \$4.90 per candle to purchase small candles and \$11.60 per candle to purchase large candles, what is the maximum number of large candles the owner can purchase to stay within the budget and maintain the discounted pricing?', NULL, NULL, '182', '["182"]'::jsonb, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '3-15', 15, 'mcq', NULL, NULL, 'In the linear function $f$, $f(0) = 8$ and $f(1) = 12$. Which equation defines $f$ ?', '{"A":"$f(x) = 12x + 8$","B":"$f(x) = 4x$","C":"$f(x) = 4x + 12$","D":"$f(x) = 4x + 8$"}'::jsonb, NULL, 'D', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '3-16', 16, 'mcq', NULL, NULL, 'The function $f(w) = 6w^2$ gives the area of a rectangle, in square feet (ft$^2$), if its width is $w$ ft and its length is 6 times its width. Which of the following is the best interpretation of $f(14) = 1{,}176$ ?', '{"A":"If the width of the rectangle is 14 ft, then the area of the rectangle is 1,176 ft$^2$.","B":"If the width of the rectangle is 14 ft, then the length of the rectangle is 1,176 ft.","C":"If the width of the rectangle is 1,176 ft, then the length of the rectangle is 14 ft.","D":"If the width of the rectangle is 1,176 ft, then the area of the rectangle is 14 ft$^2$."}'::jsonb, NULL, 'A', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '3-17', 17, 'mcq', 'Note: Figure not drawn to scale.', 'A circle with center O. Two diameters are drawn through O: diameter PR and diameter QS, dividing the circle into four arcs. Points P, Q, R, S are on the circle (P near top, R near bottom, Q and S on the sides), so that arcs PQ, QR, RS, and SP are formed. Note: Figure not drawn to scale.', 'The circle shown has center $O$, circumference $144\pi$, and diameters $PR$ and $QS$. The length of arc $PS$ is twice the length of arc $PQ$. What is the length of arc $QR$ ?', '{"A":"$24\\pi$","B":"$48\\pi$","C":"$72\\pi$","D":"$96\\pi$"}'::jsonb, '/data/tests/cb-og-2/figures/m3-q17.png', 'B', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '3-18', 18, 'mcq', NULL, NULL, 'A company that provides whale-watching tours takes groups of 21 people at a time. The company''s revenue is 80 dollars per adult and 60 dollars per child. If the company''s revenue for one group consisting of adults and children was 1,440 dollars, how many people in the group were children?', '{"A":"3","B":"9","C":"12","D":"18"}'::jsonb, NULL, 'C', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '3-19', 19, 'mcq', NULL, NULL, 'The function $h$ is defined by $h(x) = 4x + 28$. The graph of $y = h(x)$ in the xy-plane has an x-intercept at $(a, 0)$ and a y-intercept at $(0, b)$, where $a$ and $b$ are constants. What is the value of $a + b$ ?', '{"A":"21","B":"28","C":"32","D":"35"}'::jsonb, NULL, 'A', NULL, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '3-20', 20, 'grid', NULL, NULL, 'One of the factors of $2x^3 + 42x^2 + 208x$ is $x + b$, where $b$ is a positive constant. What is the smallest possible value of $b$ ?', NULL, NULL, '8', '["8"]'::jsonb, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '3-21', 21, 'grid', NULL, NULL, '$y = -1.5$
$y = x^2 + 8x + a$

In the given system of equations, $a$ is a positive constant. The system has exactly one distinct real solution. What is the value of $a$ ?', NULL, NULL, '14.5', '["14.5","29/2"]'::jsonb, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '3-22', 22, 'mcq', '$f(x) = (x + 6)(x + 5)(x - 4)$', NULL, 'The function $f$ is given. Which table of values represents $y = f(x) - 3$ ?', '{"A":"x: -6, -5, 4 → y: -9, -8, 1","B":"x: -6, -5, 4 → y: -3, -3, -3","C":"x: -6, -5, 4 → y: -3, -2, 7","D":"x: -6, -5, 4 → y: 3, 3, 3"}'::jsonb, NULL, 'B', NULL, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '3-23', 23, 'mcq', NULL, NULL, 'For the function $q$, the value of $q(x)$ decreases by 45% for every increase in the value of $x$ by 1. If $q(0) = 14$, which equation defines $q$ ?', '{"A":"$q(x) = 0.55(14)^x$","B":"$q(x) = 1.45(14)^x$","C":"$q(x) = 14(0.55)^x$","D":"$q(x) = 14(1.45)^x$"}'::jsonb, NULL, 'C', NULL, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '3-24', 24, 'mcq', NULL, 'An xy-plane with both axes labeled and a grid. The x-axis runs from -10 to 10 and the y-axis from -10 to 10 (gridlines every 2 units). A straight line with a small negative slope is drawn, crossing the y-axis at about (0, 3) and passing through approximately (-8, 5) and (8, 1); it slopes gently downward from upper-left to lower-right (slope = -1/4).', 'The graph of $y = f(x) + 14$ is shown. Which equation defines function $f$ ?', '{"A":"$f(x) = -\\dfrac{1}{4}x - 12$","B":"$f(x) = -\\dfrac{1}{4}x + 16$","C":"$f(x) = -\\dfrac{1}{4}x + 2$","D":"$f(x) = -\\dfrac{1}{4}x - 14$"}'::jsonb, '/data/tests/cb-og-2/figures/m3-q24.png', 'A', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '3-25', 25, 'mcq', 'RS = 20
ST = 48
TR = 52', NULL, 'The side lengths of right triangle $RST$ are given. Triangle $RST$ is similar to triangle $UVW$, where $S$ corresponds to $V$ and $T$ corresponds to $W$. What is the value of $\tan W$ ?', '{"A":"$\\dfrac{5}{13}$","B":"$\\dfrac{5}{12}$","C":"$\\dfrac{12}{13}$","D":"$\\dfrac{12}{5}$"}'::jsonb, NULL, 'B', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '3-26', 26, 'mcq', NULL, NULL, 'One gallon of paint will cover 220 square feet of a surface. A room has a total wall area of $w$ square feet. Which equation represents the total amount of paint $P$, in gallons, needed to paint the walls of the room twice?', '{"A":"$P = \\dfrac{w}{110}$","B":"$P = 440w$","C":"$P = \\dfrac{w}{220}$","D":"$P = 220w$"}'::jsonb, NULL, 'A', NULL, NULL, 40)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '3-27', 27, 'grid', NULL, NULL, 'The number $a$ is 110% greater than the number $b$. The number $b$ is 90% less than 47. What is the value of $a$ ?', NULL, NULL, '9.87', '["9.87"]'::jsonb, NULL, 40)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 4, 'math', 'Math — Module 2', 2100, 27)
  ON CONFLICT (test_id, position) DO UPDATE SET section=EXCLUDED.section, label=EXCLUDED.label,
    time_limit_seconds=EXCLUDED.time_limit_seconds, question_count=EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '4-1', 1, 'mcq', NULL, NULL, 'There are 55 students in Spanish club. A sample of the Spanish club students was selected at random and asked whether they intend to enroll in a new study program. Of those surveyed, 20% responded that they intend to enroll in the study program. Based on this survey, which of the following is the best estimate of the total number of Spanish club students who intend to enroll in the study program?', '{"A":"11","B":"20","C":"44","D":"55"}'::jsonb, NULL, 'A', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '4-2', 2, 'mcq', NULL, NULL, 'Jay walks at a speed of 3 miles per hour and runs at a speed of 5 miles per hour. He walks for $w$ hours and runs for $r$ hours for a combined total of 14 miles. Which equation represents this situation?', '{"A":"$3w + 5r = 14$","B":"$\\frac{1}{3}w + \\frac{1}{5}r = 14$","C":"$\\frac{1}{3}w + \\frac{1}{5}r = 112$","D":"$3w + 5r = 112$"}'::jsonb, NULL, 'A', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '4-3', 3, 'mcq', NULL, 'A scatterplot in the xy-plane. The x-axis is labeled x and ranges from about 0 to 8 in increments of 1. The y-axis is labeled y and ranges from 0 to 16 in increments of 2. Data points rise from lower-left to upper-right, and a straight line of best fit with positive slope is drawn through them, crossing roughly y = 2.8 at x = 0 and rising to about y = 16 near x = 8.', 'The scatterplot shows the relationship between two variables, $x$ and $y$. A line of best fit is also shown. Which of the following equations best represents the line of best fit shown?', '{"A":"$y = 2.8 + 1.7x$","B":"$y = 2.8 - 1.7x$","C":"$y = -2.8 + 1.7x$","D":"$y = -2.8 - 1.7x$"}'::jsonb, '/data/tests/cb-og-2/figures/m4-q3.png', 'A', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '4-4', 4, 'mcq', NULL, 'The graph of y = f(x) in the xy-plane. Both axes range from -8 to 8. The curve has two branches: a lower-left branch passing through the upper-left increasing region and crossing the y-axis at about y = 3, rising steeply for positive x; and a separate branch in the lower-right region for positive x that increases steeply from negative y values.', 'The graph of $y = f(x)$ is shown in the xy-plane. What is the value of $f(0)$ ?', '{"A":"$-3$","B":"0","C":"$\\frac{3}{5}$","D":"3"}'::jsonb, '/data/tests/cb-og-2/figures/m4-q4.png', 'D', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '4-5', 5, 'mcq', NULL, NULL, 'Which expression is equivalent to $(m^{4}q^{4}z^{-1})(mq^{5}z^{3})$, where $m$, $q$, and $z$ are positive?', '{"A":"$m^{4}q^{20}z^{-3}$","B":"$m^{5}q^{9}z^{2}$","C":"$m^{6}q^{8}z^{-1}$","D":"$m^{20}q^{12}z^{-2}$"}'::jsonb, NULL, 'B', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '4-6', 6, 'grid', '73, 74, 75, 77, 79, 82, 84, 85, 91', NULL, 'What is the median of the data shown?', NULL, NULL, '79', '["79"]'::jsonb, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '4-7', 7, 'grid', '$x + 40 = 95$', NULL, 'What value of $x$ is the solution to the given equation?', NULL, NULL, '55', '["55"]'::jsonb, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '4-8', 8, 'mcq', '$5x = 15$
$-4x + y = -2$', NULL, 'The solution to the given system of equations is $(x, y)$. What is the value of $x + y$ ?', '{"A":"$-17$","B":"$-13$","C":"13","D":"17"}'::jsonb, NULL, 'C', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '4-9', 9, 'mcq', '$g(m) = -0.05m + 12.1$', NULL, 'The given function $g$ models the number of gallons of gasoline that remains from a full gas tank in a car after driving $m$ miles. According to the model, about how many gallons of gasoline are used to drive each mile?', '{"A":"0.05","B":"12.1","C":"20","D":"242.0"}'::jsonb, NULL, 'A', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '4-10', 10, 'mcq', '$\frac{1}{7b} = \frac{11x}{y}$', NULL, 'The given equation relates the positive numbers $b$, $x$, and $y$. Which equation correctly expresses $x$ in terms of $b$ and $y$ ?', '{"A":"$x = \\frac{7by}{11}$","B":"$x = y - 77b$","C":"$x = \\frac{y}{77b}$","D":"$x = 77by$"}'::jsonb, NULL, 'C', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '4-11', 11, 'mcq', '$y = 76$
$y = x^{2} - 5$', NULL, 'The graphs of the given equations in the xy-plane intersect at the point $(x, y)$. What is a possible value of $x$ ?', '{"A":"$-\\frac{76}{5}$","B":"$-9$","C":"5","D":"76"}'::jsonb, NULL, 'B', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '4-12', 12, 'mcq', '$y > 14$
$4x + y < 18$', NULL, 'The point $(x, 53)$ is a solution to the system of inequalities in the xy-plane. Which of the following could be the value of $x$ ?', '{"A":"$-9$","B":"$-5$","C":"5","D":"9"}'::jsonb, NULL, 'A', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '4-13', 13, 'grid', NULL, NULL, 'Out of 300 seeds that were planted, 80% sprouted. How many of these seeds sprouted?', NULL, NULL, '240', '["240"]'::jsonb, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '4-14', 14, 'grid', NULL, NULL, 'The function $f$ is defined by $f(x) = 4x$. For what value of $x$ does $f(x) = 8$ ?', NULL, NULL, '2', '["2"]'::jsonb, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '4-15', 15, 'mcq', NULL, NULL, 'Which expression is equivalent to $\frac{8x(x - 7) - 3(x - 7)}{2x - 14}$, where $x > 7$ ?', '{"A":"$\\frac{x - 7}{5}$","B":"$\\frac{8x - 3}{2}$","C":"$\\frac{8x^{2} - 3x - 14}{2x - 14}$","D":"$\\frac{8x^{2} - 3x - 77}{2x - 14}$"}'::jsonb, NULL, 'B', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '4-16', 16, 'mcq', NULL, NULL, 'Line $p$ is defined by $2y + 18x = 9$. Line $r$ is perpendicular to line $p$ in the xy-plane. What is the slope of line $r$ ?', '{"A":"$-9$","B":"$-\\frac{1}{9}$","C":"$\\frac{1}{9}$","D":"9"}'::jsonb, NULL, 'C', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '4-17', 17, 'mcq', '$f(t) = 8{,}000(0.65)^{t}$', NULL, 'The given function $f$ models the number of coupons a company sent to their customers at the end of each year, where $t$ represents the number of years since the end of 1998, and $0 \le t \le 5$. If $y = f(t)$ is graphed in the ty-plane, which of the following is the best interpretation of the y-intercept of the graph in this context?', '{"A":"The minimum estimated number of coupons the company sent to their customers during the 5 years was 1,428.","B":"The minimum estimated number of coupons the company sent to their customers during the 5 years was 8,000.","C":"The estimated number of coupons the company sent to their customers at the end of 1998 was 1,428.","D":"The estimated number of coupons the company sent to their customers at the end of 1998 was 8,000."}'::jsonb, NULL, 'D', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '4-18', 18, 'mcq', NULL, NULL, 'Triangle $XYZ$ is similar to triangle $RST$ such that $X$, $Y$, and $Z$ correspond to $R$, $S$, and $T$, respectively. The measure of $\angle Z$ is $20°$ and $2XY = RS$. What is the measure of $\angle T$ ?', '{"A":"$2°$","B":"$10°$","C":"$20°$","D":"$40°$"}'::jsonb, NULL, 'C', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '4-19', 19, 'mcq', '$y = 6x + 18$', NULL, 'One of the equations in a system of two linear equations is given. The system has no solution. Which equation could be the second equation in the system?', '{"A":"$-6x + y = 18$","B":"$-6x + y = 22$","C":"$-12x + y = 36$","D":"$-12x + y = 18$"}'::jsonb, NULL, 'B', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '4-20', 20, 'grid', NULL, NULL, 'What is the area, in square centimeters, of a rectangle with a length of 34 centimeters (cm) and a width of 29 cm?', NULL, NULL, '986', '["986"]'::jsonb, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '4-21', 21, 'grid', '$y = 4x + 1$
$4y = 15x - 8$', NULL, 'The solution to the given system of equations is $(x, y)$. What is the value of $x - y$ ?', NULL, NULL, '35', '["35"]'::jsonb, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '4-22', 22, 'mcq', '$5x^{2} + 10x + 16 = 0$', NULL, 'How many distinct real solutions does the given equation have?', '{"A":"Exactly one","B":"Exactly two","C":"Infinitely many","D":"Zero"}'::jsonb, NULL, 'D', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '4-23', 23, 'mcq', NULL, NULL, 'A certain park has an area of 11,863,808 square yards. What is the area, in square miles, of this park? (1 mile = 1,760 yards)', '{"A":"1.96","B":"3.83","C":"3,444.39","D":"6,740.8"}'::jsonb, NULL, 'B', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '4-24', 24, 'mcq', NULL, NULL, 'Which of the following equations represents a circle in the xy-plane that intersects the y-axis at exactly one point?', '{"A":"$(x - 8)^{2} + (y - 8)^{2} = 16$","B":"$(x - 8)^{2} + (y - 4)^{2} = 16$","C":"$(x - 4)^{2} + (y - 9)^{2} = 16$","D":"$x^{2} + (y - 9)^{2} = 16$"}'::jsonb, NULL, 'C', NULL, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '4-25', 25, 'mcq', NULL, NULL, 'In triangles $ABC$ and $DEF$, angles $B$ and $E$ each have measure $27°$ and angles $C$ and $F$ each have measure $41°$. Which additional piece of information is sufficient to determine whether triangle $ABC$ is congruent to triangle $DEF$ ?', '{"A":"The measure of angle A","B":"The length of side AB","C":"The lengths of sides BC and EF","D":"No additional information is necessary."}'::jsonb, NULL, 'C', NULL, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '4-26', 26, 'mcq', NULL, 'Two histograms side by side titled Data Set A and Data Set B. Both have a vertical axis labeled Frequency ranging 0 to 12 in increments of 2, and a horizontal axis labeled Integer with interval marks at 10, 20, 30, 40, 50, 60. Each represents 23 integers grouped into intervals [10,20), [20,30), and so on. The two distributions differ in shape across the intervals.', 'Two data sets of 23 integers each are summarized in the histograms shown. For each of the histograms, the first interval represents the frequency of integers greater than or equal to 10, but less than 20. The second interval represents the frequency of integers greater than or equal to 20, but less than 30, and so on. What is the smallest possible difference between the mean of data set A and the mean of data set B?', '{"A":"0","B":"1","C":"10","D":"23"}'::jsonb, '/data/tests/cb-og-2/figures/m4-q26.png', 'B', NULL, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '4-27', 27, 'grid', NULL, NULL, 'A right triangle has legs with lengths of 24 centimeters and 21 centimeters. If the length of this triangle''s hypotenuse, in centimeters, can be written in the form $3\sqrt{d}$, where $d$ is an integer, what is the value of $d$ ?', NULL, NULL, '113', '["113"]'::jsonb, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
END $seed$;
