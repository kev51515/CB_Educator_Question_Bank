-- =============================================================================
-- Migration: 0166_seed_cb_og_3.sql
-- Purpose:   Seed "CB OG #3" (College Board linear Digital SAT practice test,
--            66 RW + 54 Math = 120 Q) into the full-test tables from 0048.
--   Source:  sat-practice-test-3-digital.pdf; official College Board answer key (pdf/Key/).
--   Idempotent upsert on (slug)/(test_id,position)/(module_id,position).
-- =============================================================================
DO $seed$
DECLARE v_test uuid; v_mod uuid;
BEGIN
  INSERT INTO public.tests (slug, ordinal, title, short_title, source, total_questions)
  VALUES ('cb-og-3', 9, 'CB OG #3', 'CB OG #3', 'sat-practice-test-3-digital.pdf', 120)
  ON CONFLICT (slug) DO UPDATE SET ordinal=EXCLUDED.ordinal, title=EXCLUDED.title,
    short_title=EXCLUDED.short_title, source=EXCLUDED.source, total_questions=EXCLUDED.total_questions
  RETURNING id INTO v_test;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 1, 'reading-writing', 'Reading and Writing — Module 1', 1920, 33)
  ON CONFLICT (test_id, position) DO UPDATE SET section=EXCLUDED.section, label=EXCLUDED.label,
    time_limit_seconds=EXCLUDED.time_limit_seconds, question_count=EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '1-1', 1, 'mcq', 'In the early 1800s, the Cherokee scholar Sequoyah created the first script, or writing system, for an Indigenous language in the United States. Because it represented the sounds of spoken Cherokee so accurately, his script was easy to learn and thus quickly achieved ______ use: by 1830, over 90 percent of the Cherokee people could read and write it.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"widespread","B":"careful","C":"unintended","D":"infrequent"}'::jsonb, NULL, 'A', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '1-2', 2, 'mcq', 'When Mexican-American archaeologist Zelia Maria Magdalena Nuttall published her 1886 research paper on sculptures found at the ancient Indigenous city of Teotihuacan in present-day Mexico, other researchers readily ______ her work as groundbreaking; this recognition stemmed from her convincing demonstration that the sculptures were much older than had previously been thought.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"acknowledged","B":"ensured","C":"denied","D":"underestimated"}'::jsonb, NULL, 'A', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '1-3', 3, 'mcq', 'Like other tribal nations, the Muscogee (Creek) Nation is self-governing; its National Council generates laws regulating aspects of community life such as land use and healthcare, while the principal chief and cabinet officials ______ those laws by devising policies and administering services in accordance with them.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"implement","B":"presume","C":"improvise","D":"mimic"}'::jsonb, NULL, 'A', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '1-4', 4, 'mcq', 'In the Indigenous intercropping system known as the Three Sisters, maize, squash, and beans form an ______ web of relations: maize provides the structure on which the bean vines grow; the squash vines cover the soil, discouraging competition from weeds; and the beans aid their two “sisters” by enriching the soil with essential nitrogen.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"indecipherable","B":"ornamental","C":"obscure","D":"intricate"}'::jsonb, NULL, 'D', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '1-5', 5, 'mcq', 'The artisans of the Igun Eronmwon guild in Benin City, Nigeria, typically ______ the bronze- and brass-casting techniques that have been passed down through their families since the thirteenth century, but they don’t strictly observe every tradition; for example, guild members now use air-conditioning motors instead of handheld bellows to help heat their forges.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"experiment with","B":"adhere to","C":"improve on","D":"grapple with"}'::jsonb, NULL, 'B', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '1-6', 6, 'mcq', 'Some economic historians ______ that late nineteenth- and early twentieth-century households in the United States experienced an economy of scale when it came to food purchases—they assumed that large households spent less on food per person than did small households. Economist Trevon Logan showed, however, that a close look at the available data disproves this supposition.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"surmised","B":"contrived","C":"questioned","D":"regretted"}'::jsonb, NULL, 'A', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '1-7', 7, 'mcq', 'The work of Kiowa painter T.C. Cannon derives its power in part from the tension among his ______ influences: classic European portraiture, with its realistic treatment of faces; the American pop art movement, with its vivid colors; and flatstyle, the intertribal painting style that rejects the effect of depth typically achieved through shading and perspective.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"complementary","B":"unknown","C":"disparate","D":"interchangeable"}'::jsonb, NULL, 'C', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '1-8', 8, 'mcq', 'New and interesting research conducted by Suleiman A. Al-Sweedan and Moath Alhaj is inspired by their observation that though there have been many studies of the effect of high altitude on blood chemistry, there is a ______ studies of the effect on blood chemistry of living in locations below sea level, such as the California towns of Salton City and Seeley.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"quarrel about","B":"paucity of","C":"profusion of","D":"verisimilitude in"}'::jsonb, NULL, 'B', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '1-9', 9, 'mcq', 'The following text is from Sarah Orne Jewett’s 1899 short story “Martha’s Lady.” Martha is employed by Miss Pyne as a maid.

Miss Pyne sat by the window watching, in her best dress, looking stately and calm; she seldom went out now, and it was almost time for the carriage. Martha was just coming in from the garden with the strawberries, and with more flowers in her apron. It was a bright cool evening in June, the golden robins sang in the elms, and the sun was going down behind the apple-trees at the foot of the garden. The beautiful old house stood wide open to the long-expected guest.', NULL, 'Which choice best states the main purpose of the text?', '{"A":"To convey the worries brought about by a new guest","B":"To describe how the characters have changed over time","C":"To contrast the activity indoors with the stillness outside","D":"To depict the setting as the characters await a visitor’s arrival"}'::jsonb, NULL, 'D', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '1-10', 10, 'mcq', 'Astronomers are confident that the star Betelgeuse will eventually consume all the helium in its core and explode in a supernova. They are much less confident, however, about when this will happen, since that depends on internal characteristics of Betelgeuse that are largely unknown. Astrophysicist Sarafina El-Badry Nance and colleagues recently investigated whether acoustic waves in the star could be used to determine internal stellar states but concluded that this method could not sufficiently reveal Betelgeuse’s internal characteristics to allow its evolutionary state to be firmly fixed.', NULL, 'Which choice best describes the function of the second sentence in the overall structure of the text?', '{"A":"It explains how the work of Nance and colleagues was received by others in the field.","B":"It presents the central finding reported by Nance and colleagues.","C":"It identifies the problem that Nance and colleagues attempted to solve but did not.","D":"It describes a serious limitation of the method used by Nance and colleagues."}'::jsonb, NULL, 'C', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '1-11', 11, 'mcq', 'The following text is from Jane Austen’s 1811 novel <i>Sense and Sensibility</i>. Elinor lives with her younger sisters and her mother, Mrs. Dashwood.

Elinor, this eldest daughter, whose advice was so effectual, possessed a strength of understanding, and coolness of judgment, which qualified her, though only nineteen, to be the counsellor of her mother, and enabled her frequently to counteract, to the advantage of them all, that eagerness of mind in Mrs. Dashwood which must generally have led to imprudence. She had an excellent heart;—her disposition was affectionate, and her feelings were strong; but she knew how to govern them: it was a knowledge which her mother had yet to learn; and which one of her sisters had resolved never to be taught.', NULL, 'According to the text, what is true about Elinor?', '{"A":"Elinor often argues with her mother but fails to change her mind.","B":"Elinor can be overly sensitive with regard to family matters.","C":"Elinor thinks her mother is a bad role model.","D":"Elinor is remarkably mature for her age."}'::jsonb, NULL, 'D', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '1-12', 12, 'mcq', 'Believing that living in an impractical space can heighten awareness and even improve health, conceptual artists Madeline Gins and Shusaku Arakawa designed an apartment building in Japan to be more fanciful than functional. A kitchen counter is chest-high on one side and knee-high on the other; a ceiling has a door to nowhere. The effect is disorienting but invigorating: after four years there, filmmaker Nobu Yamaoka reported significant health benefits.', NULL, 'Which choice best states the main idea of the text?', '{"A":"Although inhabiting a home surrounded by fanciful features such as those designed by Gins and Arakawa can be rejuvenating, it is unsustainable.","B":"Designing disorienting spaces like those in the Gins and Arakawa building is the most effective way to create a physically stimulating environment.","C":"As a filmmaker, Yamaoka has long supported the designs of conceptual artists such as Gins and Arakawa.","D":"Although impractical, the design of the apartment building by Gins and Arakawa may improve the well-being of the building’s residents."}'::jsonb, NULL, 'D', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '1-13', 13, 'mcq', 'In a research paper, a student criticizes some historians of modern African politics, claiming that they have evaluated Patrice Lumumba, the first prime minister of what is now the Democratic Republic of the Congo, primarily as a symbol rather than in terms of his actions.', NULL, 'Which quotation from a work by a historian would best illustrate the student’s claim?', '{"A":"“Lumumba is a difficult figure to evaluate due to the starkly conflicting opinions he inspired during his life and continues to inspire today.”","B":"“The available information makes it clear that Lumumba’s political beliefs and values were largely consistent throughout his career.”","C":"“Lumumba’s practical accomplishments can be passed over quickly; it is mainly as the personification of Congolese independence that he warrants scholarly attention.”","D":"“Many questions remain about Lumumba’s ultimate vision for an independent Congo; without new evidence coming to light, these questions are likely to remain unanswered.”"}'::jsonb, NULL, 'C', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '1-14', 14, 'mcq', 'Geographer Adebayo Oluwole Eludoyin and his colleagues surveyed small-scale farmers in three locations in Ondo State, Nigeria—which has mountainous terrain in the north, an urbanized center, and coastal terrain in the south—to learn more about their practices, like the types of crops they mainly cultivated. In some regions, female farmers were found to be especially prominent in the cultivation of specific types of crops and even constituted the majority of farmers who cultivated those crops; for instance, ______

[Bar graph — Percentage of Ondo State Small-Scale Farmers Who Are Female, by Main Crop Grown. Y-axis: Female farmers as a percentage of total (0 to 60). X-axis: Ondo State region (north Ondo, central Ondo, south Ondo). Legend: cereals, root crops, non–root vegetables.]', 'Bar graph titled “Percentage of Ondo State Small-Scale Farmers Who Are Female, by Main Crop Grown.” Y-axis: Female farmers as a percentage of total (0–60). X-axis (Ondo State region): north Ondo, central Ondo, south Ondo. Legend (bars per region): cereals, root crops, non–root vegetables.', 'Which choice most effectively uses data from the graph to complete the example?', '{"A":"most of the farmers who mainly cultivated cereals and most of the farmers who mainly cultivated non–root vegetables in south Ondo were women.","B":"more women in central Ondo mainly cultivated root crops than mainly cultivated cereals.","C":"most of the farmers who mainly cultivated non–root vegetables in north and south Ondo were women.","D":"a relatively equal proportion of women across the three regions of Ondo mainly cultivated cereals."}'::jsonb, '/data/tests/cb-og-3/figures/m1-q14.png', 'C', NULL, NULL, 9)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '1-15', 15, 'mcq', 'Given that stars and planets initially form from the same gas and dust in space, some astronomers have posited that host stars (such as the Sun) and their planets (such as those in our solar system) are composed of the same materials, with the planets containing equal or smaller quantities of the materials that make up the host star. This idea is also supported by evidence that rocky planets in our solar system are composed of some of the same materials as the Sun.', NULL, 'Which finding, if true, would most directly weaken the astronomers’ claim?', '{"A":"Most stars are made of hydrogen and helium, but when cooled they are revealed to contain small amounts of iron and silicate.","B":"A nearby host star is observed to contain the same proportion of hydrogen and helium as that of the Sun.","C":"Evidence emerges that the amount of iron in some rocky planets is considerably higher than the amount in their host star.","D":"The method for determining the composition of rocky planets is discovered to be less effective when used to analyze other kinds of planets."}'::jsonb, NULL, 'C', NULL, NULL, 9)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '1-16', 16, 'mcq', 'In the twentieth century, ethnographers made a concerted effort to collect Mexican American folklore, but they did not always agree about that folklore’s origins. Scholars such as Aurelio Espinosa claimed that Mexican American folklore derived largely from the folklore of Spain, which ruled Mexico and what is now the southwestern United States from the sixteenth to early nineteenth centuries. Scholars such as Américo Paredes, by contrast, argued that while some Spanish influence is undeniable, Mexican American folklore is mainly the product of the ongoing interactions of various cultures in Mexico and the United States.', NULL, 'Which finding, if true, would most directly support Paredes’s argument?', '{"A":"The folklore that the ethnographers collected included several songs written in the form of a <i>décima</i>, a type of poem originating in late sixteenth-century Spain.","B":"Much of the folklore that the ethnographers collected had similar elements from region to region.","C":"Most of the folklore that the ethnographers collected was previously unknown to scholars.","D":"Most of the folklore that the ethnographers collected consisted of <i>corridos</i>—ballads about history and social life—of a clearly recent origin."}'::jsonb, NULL, 'D', NULL, NULL, 10)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '1-17', 17, 'mcq', 'In the early nineteenth century, some Euro-American farmers in the northeastern United States used agricultural techniques developed by the Haudenosaunee (Iroquois) people centuries earlier, but it seems that few of those farmers had actually seen Haudenosaunee farms firsthand. Barring the possibility of several farmers of the same era independently developing techniques that the Haudenosaunee people had already invented, these facts most strongly suggest that ______', NULL, 'Which choice most logically completes the text?', '{"A":"those farmers learned the techniques from other people who were more directly influenced by Haudenosaunee practices.","B":"the crops typically cultivated by Euro-American farmers in the northeastern United States were not well suited to Haudenosaunee farming techniques.","C":"Haudenosaunee farming techniques were widely used in regions outside the northeastern United States.","D":"Euro-American farmers only began to recognize the benefits of Haudenosaunee farming techniques late in the nineteenth century."}'::jsonb, NULL, 'A', NULL, NULL, 10)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '1-18', 18, 'mcq', 'If some artifacts recovered from excavations of the settlement of Kuulo Kataa, in modern Ghana, date from the thirteenth century CE, that may lend credence to claims that the settlement was founded before or around that time. There is other evidence, however, strongly supporting a fourteenth century CE founding date for Kuulo Kataa. If both the artifact dates and the fourteenth century CE founding date are correct, that would imply that ______', NULL, 'Which choice most logically completes the text?', '{"A":"artifacts from the fourteenth century CE are more commonly recovered than are artifacts from the thirteenth century CE.","B":"the artifacts originated elsewhere and eventually reached Kuulo Kataa through trade or migration.","C":"Kuulo Kataa was founded by people from a different region than had previously been assumed.","D":"excavations at Kuulo Kataa may have inadvertently damaged some artifacts dating to the fourteenth century CE."}'::jsonb, NULL, 'B', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '1-19', 19, 'mcq', 'A team of biologists led by Jae-Hoon Jung, Antonio D. Barbosa, and Stephanie Hutin investigated the mechanism that allows <i>Arabidopsis thaliana</i> (thale cress) plants to accelerate flowering at high temperatures. They replaced the protein ELF3 in the plants with a similar protein found in another species (stiff brome) that, unlike <i>A. thaliana</i>, displays no acceleration in flowering with increased temperature. A comparison of unmodified <i>A. thaliana</i> plants with the altered plants showed no difference in flowering at 22° Celsius, but at 27° Celsius, the unmodified plants exhibited accelerated flowering while the altered ones did not, which suggests that ______', NULL, 'Which choice most logically completes the text?', '{"A":"temperature-sensitive accelerated flowering is unique to <i>A. thaliana</i>.","B":"<i>A. thaliana</i> increases ELF3 production as temperatures rise.","C":"ELF3 enables <i>A. thaliana</i> to respond to increased temperatures.","D":"temperatures of at least 22° Celsius are required for <i>A. thaliana</i> to flower."}'::jsonb, NULL, 'C', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '1-20', 20, 'mcq', 'A member of the Cherokee Nation, Mary Golda Ross is renowned for her contributions to NASA’s Planetary Flight Handbook, which ______ detailed mathematical guidance for missions to Mars and Venus.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"provided","B":"having provided","C":"to provide","D":"providing"}'::jsonb, NULL, 'A', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '1-21', 21, 'mcq', 'Typically, underlines, scribbles, and notes left in the margins by a former owner lower a book’s ______ when the former owner is a famous poet like Walt Whitman, such markings, known as marginalia, can be a gold mine to literary scholars.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"value, but","B":"value","C":"value,","D":"value but"}'::jsonb, NULL, 'A', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '1-22', 22, 'mcq', 'After the United Kingdom began rolling out taxes equivalent to a few cents on single-use plastic grocery bags in 2011, plastic-bag consumption decreased by up to ninety ______ taxes are subject to what economists call the “rebound effect”: as the change became normalized, plastic-bag use started to creep back up.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"percent, such","B":"percent and such","C":"percent. Such","D":"percent such"}'::jsonb, NULL, 'C', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '1-23', 23, 'mcq', 'As British scientist Peter Whibberley has observed, “the Earth is not a very good timekeeper.” Earth’s slightly irregular rotation rate means that measurements of time must be periodically adjusted. Specifically, an extra “leap second” (the 86,401st second of the day) is ______ time based on the planet’s rotation lags a full nine-tenths of a second behind time kept by precise atomic clocks.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"added, whenever","B":"added; whenever","C":"added. Whenever","D":"added whenever"}'::jsonb, NULL, 'D', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '1-24', 24, 'mcq', 'Bengali author Toru Dutt’s <i>A Sheaf Gleaned in</i> <i>French Fields</i> (1876), a volume of English translations of French poems, ______ scholars’ understanding of the transnational and multilingual contexts in which Dutt lived and worked.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"has enhanced","B":"are enhancing","C":"have enhanced","D":"enhance"}'::jsonb, NULL, 'A', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '1-25', 25, 'mcq', 'Journalists have dubbed Gil Scott-Heron the “godfather of rap,” a title that has appeared in hundreds of articles about him since the 1990s. Scott-Heron himself resisted the godfather ______ feeling that it didn’t encapsulate his devotion to the broader African American blues music tradition as well as “bluesologist,” the moniker he preferred.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"nickname, however","B":"nickname, however;","C":"nickname, however,","D":"nickname; however,"}'::jsonb, NULL, 'C', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '1-26', 26, 'mcq', 'From afar, African American fiber artist Bisa Butler’s portraits look like paintings, their depictions of human faces, bodies, and clothing so intricate that it seems only a fine brush could have rendered them. When viewed up close, however, the portraits reveal themselves to be ______ stitching barely visible among the thousands of pieces of printed, microcut fabric.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"quilts, and the","B":"quilts, the","C":"quilts; the","D":"quilts. The"}'::jsonb, NULL, 'B', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '1-27', 27, 'mcq', 'Most conifers (trees belonging to the phylum Coniferophyta) are evergreen. That is, they keep their green leaves or needles year-round. However, not all conifer species are evergreen. Larch trees, ______ lose their needles every fall.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"for instance,","B":"nevertheless,","C":"meanwhile,","D":"in addition,"}'::jsonb, NULL, 'A', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 28, '1-28', 28, 'mcq', 'While researching a topic, a student has taken the following notes:
• Sam Maloof (1916–2009) was an American woodworker and furniture designer.
• He was the son of Lebanese immigrants.
• He received a “genius grant” from the John D. and Catherine T. MacArthur Foundation in 1985.
• The Museum of Fine Arts in Boston, Massachusetts, owns a rocking chair that Maloof made from walnut wood.
• The armrests and the seat of the chair are sleek and contoured, and the back consists of seven spindle-like slats.

The student wants to describe the rocking chair to an audience unfamiliar with Sam Maloof.', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"With its sleek, contoured armrests and seat, the walnut rocking chair in Boston’s Museum of Fine Arts is just one piece of furniture created by American woodworker Sam Maloof.","B":"Sam Maloof was born in 1916 and died in 2009, and during his life, he made a chair that you can see if you visit the Museum of Fine Arts in Boston.","C":"Furniture designer Sam Maloof was a recipient of one of the John D. and Catherine T. MacArthur Foundation’s “genius grants.”","D":"The rocking chair is made from walnut, and it has been shaped such that its armrests and seat are sleek and contoured."}'::jsonb, NULL, 'A', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 29, '1-29', 29, 'mcq', 'While researching a topic, a student has taken the following notes:
• In the late 1890s, over 14,000 unique varieties of apples were grown in the US.
• The rise of industrial agriculture in the mid-1900s narrowed the range of commercially grown crops.
• Thousands of apple varieties considered less suitable for commercial growth were lost.
• Today, only 15 apple varieties dominate the market, making up 90% of apples purchased in the US.
• The Lost Apple Project, based in Washington State, attempts to find and grow lost apple varieties.

The student wants to emphasize the decline in unique apple varieties in the US and specify why this decline occurred.', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish these goals?', '{"A":"The Lost Apple Project is dedicated to finding some of the apple varieties lost following a shift in agricultural practices in the mid-1900s.","B":"While over 14,000 apple varieties were grown in the US in the late 1890s, only 15 unique varieties make up most of the apples sold today.","C":"Since the rise of industrial agriculture, US farmers have mainly grown the same few unique apple varieties, resulting in the loss of thousands of varieties less suitable for commercial growth.","D":"As industrial agriculture rose to prominence in the mid-1900s, the number of crops selected for cultivation decreased dramatically."}'::jsonb, NULL, 'C', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 30, '1-30', 30, 'mcq', 'While researching a topic, a student has taken the following notes:
• Cecilia Vicuña is a multidisciplinary artist.
• In 1971, her first solo art exhibition, <i>Pinturas</i>, <i>poemas y explicaciones</i>, was shown at the Museo Nacional de Bellas Artes in Santiago, Chile.
• Her poetry collection Precario/Precarious was published in 1983 by Tanam Press.
• Her poetry collection <i>Instan</i> was published in 2002 by Kelsey St. Press.
• She lives part time in Chile, where she was born, and part time in New York.

The student wants to introduce the artist’s 1983 poetry collection.', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Before she published the books Precario/Precarious (1983) and <i>Instan</i> (2002), Cecilia Vicuña exhibited visual art at the Museo Nacional de Bellas Artes in Santiago, Chile.","B":"Cecilia Vicuña is a true multidisciplinary artist whose works include numerous poetry collections and visual art exhibitions.","C":"Published in 1983 by Tanam Press, Precario/Precarious is a collection of poetry by the multidisciplinary artist Cecilia Vicuña.","D":"In 1971, Cecilia Vicuña exhibited her first solo art exhibition, <i>Pinturas</i>, <i>poemas y explicaciones</i>, in Chile, her country of birth."}'::jsonb, NULL, 'C', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 31, '1-31', 31, 'mcq', 'While researching a topic, a student has taken the following notes:
• When medical students mention their patients on social media, they may violate patient confidentiality.
• Terry Kind led a study to determine how many medical schools have student policies that mention social media use.
• Kind and her team reviewed 132 medical school websites, examining publicly available student policies.
• Only thirteen medical schools had guidelines that explicitly mention social media, and only five defined what constitutes acceptable social media use.

The student wants to emphasize the study’s methodology.', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"The student policies of 132 medical schools can be found online, according to research by Terry Kind.","B":"To find out how many medical schools have guidelines about student social media use, Terry Kind and her team examined the student policies of 132 medical schools.","C":"Out of 132 medical schools, only thirteen had student policies that mentioned social media, and only five specified what use was acceptable.","D":"Terry Kind and her team wanted to know how many medical schools have student social media policies in place about protecting patient confidentiality."}'::jsonb, NULL, 'B', NULL, NULL, 16)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 32, '1-32', 32, 'mcq', 'While researching a topic, a student has taken the following notes:
• The Gullah are a group of African Americans who have lived in parts of the southeastern United States since the 18th century.
• Gullah culture is influenced by West African and Central African traditions.
• Louise Miller Cohen is a Gullah historian, storyteller, and preservationist.
• She founded the Gullah Museum of Hilton Head Island, South Carolina, in 2003.
• Vermelle Rodrigues is a Gullah historian, artist, and preservationist.
• She founded the Gullah Museum of Georgetown, South Carolina, in 2003.

The student wants to emphasize the duration and purpose of Cohen’s and Rodrigues’s work.', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"At the Gullah Museums in Hilton Head Island and Georgetown, South Carolina, visitors can learn more about the Gullah people who have lived in the region for centuries.","B":"Louise Miller Cohen and Vermelle Rodrigues have worked to preserve the culture of the Gullah people, who have lived in the United States since the 18th century.","C":"Since 2003, Louise Miller Cohen and Vermelle Rodrigues have worked to preserve Gullah culture through their museums.","D":"Influenced by the traditions of West and Central Africa, Gullah culture developed in parts of the southeastern United States in the 18th century."}'::jsonb, NULL, 'C', NULL, NULL, 16)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 33, '1-33', 33, 'mcq', 'While researching a topic, a student has taken the following notes:
• In North America, woodlands have expanded into areas that were once grasslands.
• Thomas Rogers and F. Leland Russell of Wichita State University investigated whether woodland expansion is related to changes in climate.
• Rogers and Russell analyzed core samples from oak trees on a site that was not wooded in the past and indexed the age of the trees with historical climate data to see if tree populations and climate were correlated.
• Tree population growth was associated with dry intervals.
• Droughts may have played a role in woodland expansion.

The student wants to emphasize the aim of the research study.', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Thomas Rogers and F. Leland Russell, researchers at Wichita State University, wanted to know if woodland expansion is related to changes in climate.","B":"Thanks to the work done by Thomas Rogers and F. Leland Russell, we now know that droughts may have played a role in woodland expansion.","C":"Wichita State University researchers have determined that tree population growth was associated with dry intervals.","D":"Thomas Rogers and F. Leland Russell analyzed core samples from oak trees on a site that was not wooded in the past, indexing the age of the trees with historical climate data."}'::jsonb, NULL, 'A', NULL, NULL, 17)
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
  VALUES (v_mod, 1, '2-1', 1, 'mcq', NULL, NULL, 'According to botanists, a viburnum plant experiencing insect damage may develop erineum—a discolored, felty growth—on its leaf blades. A viburnum plant, on the other hand, will have leaves with smooth surfaces and uniformly green coloration.

Which choice completes the text with the most logical and precise word or phrase?', '{"A":"struggling","B":"beneficial","C":"simple","D":"healthy"}'::jsonb, NULL, 'D', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '2-2', 2, 'mcq', NULL, NULL, 'Nigerian American author Teju Cole''s ______ his two passions—photography and the written word—culminates in his 2017 book, <i>Blind Spot</i>, which evocatively combines his original photographs from his travels with his poetic prose.

Which choice completes the text with the most logical and precise word or phrase?', '{"A":"indifference to","B":"enthusiasm for","C":"concern about","D":"surprise at"}'::jsonb, NULL, 'B', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '2-3', 3, 'mcq', NULL, NULL, 'Novelist N. K. Jemisin declines to ______ the conventions of the science fiction genre in which she writes, and she has suggested that her readers appreciate her work precisely because of this willingness to thwart expectations and avoid formulaic plots and themes.

Which choice completes the text with the most logical and precise word or phrase?', '{"A":"question","B":"react to","C":"perceive","D":"conform to"}'::jsonb, NULL, 'D', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '2-4', 4, 'mcq', NULL, NULL, 'In <i>Nature Poem</i> (2017), Kumeyaay poet Tommy Pico portrays his ______ the natural world by honoring the centrality of nature within his tribe''s traditional beliefs while simultaneously expressing his distaste for being in wilderness settings himself.

Which choice completes the text with the most logical and precise word or phrase?', '{"A":"responsiveness to","B":"ambivalence toward","C":"renunciation of","D":"mastery over"}'::jsonb, NULL, 'B', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '2-5', 5, 'mcq', 'The following text is from the 1924 poem "Cycle" by D''Arcy McNickle, who was a citizen of the Confederated Salish and Kootenai Tribes.

 There shall be new roads wending,
 A new beating of the drum—
 Men''s eyes shall have fresh seeing,
 Grey lives reprise their span—
 But under the new sun''s being,
 Completing what night began,
 There''ll be the same backs bending,
 The same sad feet shall drum—
 When this night finds its ending
 And day shall have come....', NULL, 'Which choice best states the main purpose of the text?', '{"A":"To consider how the repetitiveness inherent in human life can be both rewarding and challenging","B":"To question whether activities completed at one time of day are more memorable than those completed at another time of day","C":"To refute the idea that joy is a more commonly experienced emotion than sadness is","D":"To demonstrate how the experiences of individuals relate to the experiences of their communities"}'::jsonb, NULL, 'A', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '2-6', 6, 'mcq', 'The following text is adapted from Jane Austen''s 1814 novel <i>Mansfield Park</i>. The speaker, Tom, is considering staging a play at home with a group of his friends and family.

We mean nothing but a little amusement among ourselves, just to vary the scene, and exercise our powers in something new. We want no audience, no publicity. We may be trusted, I think, in choosing some play most perfectly unexceptionable; and I can conceive no greater harm or danger to any of us in conversing in the elegant written language of some respectable author than in chattering in words of our own.', NULL, 'Which choice best states the main purpose of the text?', '{"A":"To offer Tom''s assurance that the play will be inoffensive and involve only a small number of people","B":"To clarify that the play will not be performed in the manner Tom had originally intended","C":"To elaborate on the idea that the people around Tom lack the skills to successfully stage a play","D":"To assert that Tom believes the group performing the play will be able to successfully promote it"}'::jsonb, NULL, 'A', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '2-7', 7, 'mcq', 'Musician Joni Mitchell, who is also a painter, uses images she creates for her album covers to emphasize ideas expressed in her music. For the cover of her album <i>Turbulent Indigo</i> (1994), Mitchell painted a striking self-portrait that closely resembles Vincent van Gogh''s <i>Self-Portrait with Bandaged Ear</i> (1889). The image calls attention to the album''s title song, in which Mitchell sings about the legacy of the postimpressionist painter. In that song, Mitchell also hints that she feels a strong artistic connection to Van Gogh—an idea that is reinforced by her imagery on the cover.', NULL, 'Which choice best describes the overall structure of the text?', '{"A":"It presents a claim about Mitchell, then gives an example supporting that claim.","B":"It discusses Van Gogh''s influence on Mitchell, then considers Mitchell''s influence on other artists.","C":"It describes a similarity between two artists, then notes a difference between them.","D":"It describes the songs on <i>Turbulent Indigo</i>, then explains how they relate to the album''s cover."}'::jsonb, NULL, 'A', NULL, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '2-8', 8, 'mcq', 'Text 1
Astronomer Mark Holland and colleagues examined four white dwarfs—small, dense remnants of past stars—in order to determine the composition of exoplanets that used to orbit those stars. Studying wavelengths of light in the white dwarf atmospheres, the team reported that traces of elements such as lithium and sodium support the presence of exoplanets with continental crusts similar to Earth''s.

Text 2
Past studies of white dwarf atmospheres have concluded that certain exoplanets had continental crusts. Geologist Keith Putirka and astronomer Siyi Xu argue that those studies unduly emphasize atmospheric traces of lithium and other individual elements as signifiers of the types of rock found on Earth. The studies don''t adequately account for different minerals made up of various ratios of those elements, and the possibility of rock types not found on Earth that contain those minerals.', NULL, 'Based on the texts, how would Putirka and Xu (Text 2) most likely characterize the conclusion presented in Text 1?', '{"A":"As unexpected, because it was widely believed at the time that white dwarf exoplanets lack continental crusts","B":"As premature, because researchers have only just begun trying to determine what kinds of crusts white dwarf exoplanets had","C":"As questionable, because it rests on an incomplete consideration of potential sources of the elements detected in white dwarf atmospheres","D":"As puzzling, because it''s unusual to successfully detect lithium and sodium when analyzing wavelengths of light in white dwarf atmospheres"}'::jsonb, NULL, 'C', NULL, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '2-9', 9, 'mcq', 'Utah is home to Pando, a colony of about 47,000 quaking aspen trees that all share a single root system. Pando is one of the largest single organisms by mass on Earth, but ecologists are worried that its growth is declining in part because of grazing by animals. The ecologists say that strong fences could prevent deer from eating young trees and help Pando start thriving again.', NULL, 'According to the text, why are ecologists worried about Pando?', '{"A":"It isn''t growing at the same rate it used to.","B":"It isn''t producing young trees anymore.","C":"It can''t grow into new areas because it is blocked by fences.","D":"Its root system can''t support many more new trees."}'::jsonb, NULL, 'A', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '2-10', 10, 'mcq', 'For many years, the only existing fossil evidence of mixopterid eurypterids—an extinct family of large aquatic arthropods known as sea scorpions and related to modern arachnids and horseshoe crabs—came from four species living on the paleocontinent of Laurussia. In a discovery that expands our understanding of the geographical distribution of mixopterids, paleontologist Bo Wang and others have identified fossilized remains of a new mixopterid species, <i>Terropterus xiushanensis</i>, that lived over 400 million years ago on the paleocontinent of Gondwana.', NULL, 'According to the text, why was Wang and his team''s discovery of the <i>Terropterus xiushanensis</i> fossil significant?', '{"A":"The fossil constitutes the first evidence found by scientists that mixopterids lived more than 400 million years ago.","B":"The fossil helps establish that mixopterids are more closely related to modern arachnids and horseshoe crabs than previously thought.","C":"The fossil helps establish a more accurate timeline of the evolution of mixopterids on the paleocontinents of Laurussia and Gondwana.","D":"The fossil constitutes the first evidence found by scientists that mixopterids existed outside the paleocontinent of Laurussia."}'::jsonb, NULL, 'D', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '2-11', 11, 'mcq', 'The novelist Toni Morrison was the first Black woman to work as an editor at the publishing company Random House, from 1967 to 1983. A scholar asserts that one of Morrison''s likely aims during her time as an editor was to strengthen the presence of Black writers on the list of Random House''s published authors.', NULL, 'Which finding, if true, would most strongly support the scholar''s claim?', '{"A":"The percentage of authors published by Random House who were Black rose in the early 1970s and stabilized throughout the decade.","B":"Black authors who were interviewed in the 1980s and 1990s were highly likely to cite Toni Morrison''s novels as a principal influence on their work.","C":"The novels written by Toni Morrison that were published after 1983 sold significantly more copies and received wider critical acclaim than the novels she wrote that were published before 1983.","D":"Works that were edited by Toni Morrison during her time at Random House displayed stylistic characteristics that distinguished them from works that were not edited by Morrison."}'::jsonb, NULL, 'A', NULL, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '2-12', 12, 'mcq', '"The Poet Walt Whitman" is an 1887 essay by José Martí, a Cuban author and political activist, originally written in Spanish. In the essay, Martí explores the value of literature, arguing that a society''s spiritual well-being depends on the character of its literary culture: ______', NULL, 'Which quotation from a translation of "The Poet Walt Whitman" most effectively illustrates the claim?', '{"A":"\"Poetry, which brings together or separates, which fortifies or brings anguish, which shores up or demolishes souls, which gives or robs men of faith and vigor, is more necessary to a people than industry itself, for industry provides them with a means of subsistence, while literature gives them the desire and strength for life.\"","B":"\"Every society brings to literature its own form of expression, and the history of the nations can be told with greater truth by the stages of literature than by chronicles and decades.\"","C":"\"Where will a race of men go when they have lost the habit of thinking with faith about the scope and meaning of their actions? The best among them, those who consecrate Nature with their sacred desire for the future, will lose, in a sordid and painful annihilation, all stimulus to alleviate the ugliness of humanity.\"","D":"“Listen to the song of this hardworking and satisfied nation; listen to Walt Whitman. The exercise of himself exalts him to majesty, tolerance exalts him to justice, and order to joy.”"}'::jsonb, NULL, 'A', NULL, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '2-13', 13, 'mcq', 'The following table presents estimates of tyrannosaurid bite force from different studies. Estimates of Tyrannosaurid Bite Force. Columns: Study, Year, Estimation method, Approximate bite force (newtons). Rows: Cost et al., 2019, muscular and skeletal modeling, 35,000–63,000; Gignac and Erickson, 2017, tooth-bone interaction analysis, 8,000–34,000; Meers, 2002, body-mass scaling, 183,000–235,000; Bates and Falkingham, 2012, muscular and skeletal modeling, 35,000–57,000.

The largest tyrannosaurids—the family of carnivorous dinosaurs that includes <i>Tarbosaurus</i>, <i>Albertosaurus</i>, and, most famously, <i>Tyrannosaurus rex</i>—are thought to have had the strongest bites of any land animals in Earth''s history. Determining the bite force of extinct animals can be difficult, however, and paleontologists Paul Barrett and Emily Rayfield have suggested that an estimate of dinosaur bite force may be significantly influenced by the methodology used in generating that estimate.', NULL, 'Which choice best describes data from the table that support Barrett and Rayfield''s suggestion?', '{"A":"The study by Meers used body-mass scaling and produced the lowest estimated maximum bite force, while the study by Cost et al. used muscular and skeletal modeling and produced the highest estimated maximum.","B":"In their study, Gignac and Erickson used tooth-bone interaction analysis to produce an estimated bite force range with a minimum of 8,000 newtons and a maximum of 34,000 newtons.","C":"The bite force estimates produced by Bates and Falkingham and by Cost et al. were similar to each other, while the estimates produced by Meers and by Gignac and Erickson each differed substantially from any other estimate.","D":"The estimated maximum bite force produced by Cost et al. exceeded the estimated maximum produced by Bates and Falkingham, even though both groups of researchers used the same method to generate their estimates."}'::jsonb, NULL, 'C', NULL, NULL, 23)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '2-14', 14, 'mcq', 'The following table presents the number and origin of clamshell tools found at different levels below the surface in a Neanderthal cave. Number and Origin of Clamshell Tools Found at Different Levels Below the Surface in Neanderthal Cave. Columns: Depth of tools found below surface in cave (meters), Clamshells that Neanderthals collected from the beach, Clamshells that Neanderthals harvested from the seafloor. Rows: 3–4, 99, 33; 6–7, 1, 0; 4–5, 2, 0; 2–3, 7, 0; 5–6, 18, 7.

Studying tools unearthed at a cave site on the western coast of Italy, archaeologist Paola Villa and colleagues have determined that prehistoric Neanderthal groups fashioned them from shells of clams that they harvested from the seafloor while wading or diving or that washed up on the beach. Clamshells become thin and eroded as they wash up on the beach, while those on the seafloor are smooth and sturdy, so the research team suspects that Neanderthals prized the tools made with seafloor shells. However, the team also concluded that those tools were likely more challenging to obtain, noting that ______', NULL, 'Which choice most effectively uses data from the table to support the research team''s conclusion?', '{"A":"at each depth below the surface in the cave, the difference in the numbers of tools of each type suggests that shells were easier to collect from the beach than to harvest from the seafloor.","B":"the highest number of tools were at a depth of 3–4 meters below the surface, which suggests that the Neanderthal population at the site was highest during the related period of time.","C":"at each depth below the surface in the cave, the difference in the numbers of tools of each type suggests that Neanderthals preferred to use clamshells from the beach because of their durability.","D":"the higher number of tools at depths of 5–6 meters below the surface in the cave than at depths of 4–5 meters below the surface suggests that the size of clam populations changed over time."}'::jsonb, NULL, 'A', NULL, NULL, 24)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '2-15', 15, 'mcq', 'The following table presents the average number and duration of torpor bouts and arousal episodes for Alaska marmots and Arctic ground squirrels from 2008–2011. Average Number and Duration of Torpor Bouts and Arousal Episodes for Alaska Marmots and Arctic Ground Squirrels, 2008–2011. Columns: Feature, Alaska marmots, Arctic ground squirrels. Rows: torpor bouts, 12, 10.5; duration per bout, 13.81 days, 16.77 days; arousal episodes, 11, 9.5; duration per episode, 21.2 hours, 14.2 hours.

When hibernating, Alaska marmots and Arctic ground squirrels enter a state called torpor, which minimizes the energy their bodies need to function. Often a hibernating animal will temporarily come out of torpor (called an arousal episode) and its metabolic rate will rise, burning more of the precious energy the animal needs to survive the winter. Alaska marmots hibernate in groups and therefore burn less energy keeping warm during these episodes than they would if they were alone. A researcher hypothesized that because Arctic ground squirrels hibernate alone, they would likely exhibit longer bouts of torpor and shorter arousal episodes than Alaska marmots.', NULL, 'Which choice best describes data from the table that support the researcher''s hypothesis?', '{"A":"The Alaska marmots'' arousal episodes lasted for days, while the Arctic ground squirrels'' arousal episodes lasted less than a day.","B":"The Alaska marmots and the Arctic ground squirrels both maintained torpor for several consecutive days per bout, on average.","C":"The Alaska marmots had shorter torpor bouts and longer arousal episodes than the Arctic ground squirrels did.","D":"The Alaska marmots had more torpor bouts than arousal episodes, but their arousal episodes were much shorter than their torpor bouts."}'::jsonb, NULL, 'C', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '2-16', 16, 'mcq', 'Ratified by more than 90 countries, the Nagoya Protocol is an international agreement ensuring that Indigenous communities are compensated when their agricultural resources and knowledge of wild plants and animals are utilized by agricultural corporations. However, the protocol has shortcomings. For example, it allows corporations to insist that their agreements with communities to conduct research on the commercial uses of the communities'' resources and knowledge remain confidential. Therefore, some Indigenous advocates express concern that the protocol may have the unintended effect of ______', NULL, 'Which choice most logically completes the text?', '{"A":"diminishing the monetary reward that corporations might derive from their agreements with Indigenous communities.","B":"limiting the research that corporations conduct on the resources of the Indigenous communities with which they have signed agreements.","C":"preventing independent observers from determining whether the agreements guarantee equitable compensation for Indigenous communities.","D":"discouraging Indigenous communities from learning new methods for harvesting plants and animals from their corporate partners."}'::jsonb, NULL, 'C', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '2-17', 17, 'mcq', 'The domestic sweet potato (<i>Ipomoea batatas</i>) descends from a wild plant native to South America. It also populates the Polynesian Islands, where evidence confirms that Native Hawaiians and other Indigenous peoples were cultivating the plant centuries before seafaring first occurred over the thousands of miles of ocean separating them from South America. To explain how the sweet potato was first introduced in Polynesia, botanist Pablo Muñoz-Rodríguez and colleagues analyzed the DNA of numerous varieties of the plant, concluding that Polynesian varieties diverged from South American ones over 100,000 years ago. Given that Polynesia was peopled only in the last three thousand years, the team concluded that ______', NULL, 'Which choice most logically completes the text?', '{"A":"the cultivation of the sweet potato in Polynesia likely predates its cultivation in South America.","B":"Polynesian peoples likely acquired the sweet potato from South American peoples only within the last three thousand years.","C":"human activity likely played no role in the introduction of the sweet potato in Polynesia.","D":"Polynesian sweet potato varieties likely descend from a single South American variety that was domesticated, not wild."}'::jsonb, NULL, 'C', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '2-18', 18, 'mcq', 'Atoms in a synchrotron, a type of circular particle accelerator, travel faster and faster until they ______ a desired energy level, at which point they are diverted to collide with a target, smashing the atoms.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"will reach","B":"reach","C":"had reached","D":"are reaching"}'::jsonb, NULL, 'B', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '2-19', 19, 'mcq', 'Even though bats prefer very sweet nectar, the plants that attract them have evolved to produce nectar that is only moderately sweet. A recent study ______ why: making sugar is energy-intensive, and it is more advantageous for plants to make a large amount of low-sugar nectar than a small amount of high-sugar nectar.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"explains","B":"explaining","C":"having explained","D":"to explain"}'::jsonb, NULL, 'A', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '2-20', 20, 'mcq', 'Former First Lady of the United States Eleanor Roosevelt and Indian activist and educator Hansa Mehta were instrumental in drafting the United Nations'' Universal Declaration of Human Rights, a document that ______ the basic freedoms to which all people are entitled.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"have outlined","B":"were outlining","C":"outlines","D":"outline"}'::jsonb, NULL, 'C', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '2-21', 21, 'mcq', 'The life spans of rockfish vary greatly by species. For instance, the colorful calico rockfish (<i>Sebastes dalli</i>) can survive for a little over a ______ the rougheye rockfish (<i>Sebastes aleutianus</i>) boasts a maximum life span of about two centuries.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"decade: while","B":"decade. While","C":"decade; while","D":"decade, while"}'::jsonb, NULL, 'D', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '2-22', 22, 'mcq', 'The Lion Light system, developed by Kenyan inventor Richard Turere, consists of LED lights installed around the perimeter of livestock pastures. Powered with ______ the blinking LEDs keep lions away at night, thus protecting the livestock without risking harm to the endangered lions.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"energy collected, by solar panels, during the day","B":"energy collected by solar panels during the day","C":"energy collected by solar panels during the day,","D":"energy, collected by solar panels during the day,"}'::jsonb, NULL, 'C', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '2-23', 23, 'mcq', 'Materials scientist Marie-Agathe Charpagne and her colleagues believed they could improve on the multicomponent alloy NiCoCr, an equal-proportions mixture of nickel (Ni), cobalt (Co), and chromium (Cr), by replacing chromium with ruthenium (Ru), an element that''s similar to chromium ______ the alloy that resulted, NiCoRu, turned out to be an unsuitable replacement for NiCoCr.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"(Ru)","B":"(Ru) but","C":"(Ru),","D":"(Ru), but"}'::jsonb, NULL, 'D', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '2-24', 24, 'mcq', 'The Progressive Era in the United States witnessed the rise of numerous Black women''s clubs, local organizations that advocated for racial and gender equality. Among the clubs'' leaders ______ Josephine St. Pierre Ruffin, founder of the Women''s Era Club of Boston.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"was","B":"were","C":"are","D":"have been"}'::jsonb, NULL, 'A', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '2-25', 25, 'mcq', 'Based on genetic evidence, archaeologists have generally agreed that reindeer domestication began in the eleventh century CE. However, since uncovering fragments of a 2,000-year-old reindeer training harness in northern Siberia, ______ may have begun much earlier.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"researcher Robert Losey has argued that domestication","B":"researcher Robert Losey''s argument is that domestication","C":"domestication, researcher Robert Losey has argued,","D":"the argument researcher Robert Losey has made is that domestication"}'::jsonb, NULL, 'A', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '2-26', 26, 'mcq', 'Hegra is an archaeological site in present-day Saudi Arabia and was the second largest city of the Nabataean Kingdom (fourth century BCE to first century CE). Archaeologist Laila Nehmé recently traveled to Hegra to study its ancient ______ into the rocky outcrops of a vast desert, these burial chambers seem to blend seamlessly with nature.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"tombs. Built","B":"tombs, built","C":"tombs and built","D":"tombs built"}'::jsonb, NULL, 'A', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '2-27', 27, 'mcq', 'When external forces are applied to common glass made from silicates, energy builds up around minuscule defects in the material, resulting in fractures. Recently, engineer Erkka Frankberg of Tampere University in Finland used the chemical ______ to make a glassy solid that can withstand higher strain than silicate glass can before fracturing.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"compound, aluminum oxide","B":"compound aluminum oxide,","C":"compound, aluminum oxide,","D":"compound aluminum oxide"}'::jsonb, NULL, 'D', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 28, '2-28', 28, 'mcq', 'Etched into Peru''s Nazca Desert are line drawings so large that they can only be fully seen from high above. Archaeologists have known of the lines since the 1920s, when a researcher spotted some from a nearby foothill, and they have been studying the markings ever since. ______ archaeologists'' efforts are aided by drones that capture high-resolution aerial photographs of the lines.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Currently,","B":"In comparison,","C":"Still,","D":"However,"}'::jsonb, NULL, 'A', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 29, '2-29', 29, 'mcq', 'Archaeologist Sue Brunning explains why the seventh-century ship burial site at Sutton Hoo in England was likely the tomb of a king. First, the gold artifacts inside the ship suggest that the person buried with them was a wealthy and respected leader. ______ the massive effort required to bury the ship would likely only have been undertaken for a king.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Instead,","B":"Still,","C":"Specifically,","D":"Second,"}'::jsonb, NULL, 'D', NULL, NULL, 29)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 30, '2-30', 30, 'mcq', 'The more diverse and wide ranging an animal''s behaviors, the larger and more energy demanding the animal''s brain tends to be. ______ from an evolutionary perspective, animals that perform only basic actions should allocate fewer resources to growing and maintaining brain tissue. The specialized subtypes of ants within colonies provide an opportunity to explore this hypothesis.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Subsequently,","B":"Besides,","C":"Nevertheless,","D":"Thus,"}'::jsonb, NULL, 'D', NULL, NULL, 29)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 31, '2-31', 31, 'mcq', 'When designing costumes for film, American artist Suttirat Larlarb typically custom fits the garments to each actor. ______ for the film <i>Sunshine</i>, in which astronauts must reignite a dying Sun, she designed a golden spacesuit and had a factory reproduce it in a few standard sizes; lacking a tailor-made quality, the final creations reflected the ungainliness of actual spacesuits.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Nevertheless,","B":"Thus,","C":"Likewise,","D":"Moreover,"}'::jsonb, NULL, 'A', NULL, NULL, 29)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 32, '2-32', 32, 'mcq', 'While researching a topic, a student has taken the following notes:

• Shaun Tan is an Australian author.
• In 2008, he published <i>Tales from Outer Suburbia</i>, a book of fifteen short stories.
• The stories describe surreal events occurring in otherwise ordinary suburban neighborhoods.
• In 2018, he published <i>Tales from the Inner City</i>, a book of twenty-five short stories.
• The stories describe surreal events occurring in otherwise ordinary urban settings.

The student wants to emphasize a similarity between the two books by Shaun Tan. Which choice most effectively uses relevant information from the notes to accomplish this goal?', NULL, 'The student wants to emphasize a similarity between the two books by Shaun Tan. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Shaun Tan''s book <i>Tales from Outer Suburbia</i>, which describes surreal events occurring in otherwise ordinary places, contains fewer short stories than <i>Tales from the Inner City</i> does.","B":"<i>Tales from Outer Suburbia</i> was published in 2008, and <i>Tales from the Inner City</i> was published in 2018.","C":"Unlike <i>Tales from the Inner City</i>, Shaun Tan''s book <i>Tales from Outer Suburbia</i> is set in suburban neighborhoods.","D":"Shaun Tan''s books <i>Tales from Outer Suburbia</i> and <i>Tales from the Inner City</i> both describe surreal events occurring in otherwise ordinary places."}'::jsonb, NULL, 'D', NULL, NULL, 30)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 33, '2-33', 33, 'mcq', 'While researching a topic, a student has taken the following notes:

• The factors that affect clutch size (the number of eggs laid at one time) have been well studied in birds but not in lizards.
• A team led by Shai Meiri of Tel Aviv University investigated which factors influence lizard clutch size.
• Meiri''s team obtained clutch-size and habitat data for over 3,900 lizard species and analyzed the data with statistical models.
• Larger clutch size was associated with environments in higher latitudes that have more seasonal change.
• Lizards in higher-latitude environments may lay larger clutches to take advantage of shorter windows of favorable conditions.

The student wants to emphasize the aim of the research study. Which choice most effectively uses relevant information from the notes to accomplish this goal?', NULL, 'The student wants to emphasize the aim of the research study. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Researchers wanted to know which factors influence lizard egg clutch size because such factors have been well studied in birds but not in lizards.","B":"After they obtained data for over 3,900 lizard species, researchers determined that larger clutch size was associated with environments in higher latitudes that have more seasonal change.","C":"We now know that lizards in higher-latitude environments may lay larger clutches to take advantage of shorter windows of favorable conditions.","D":"Researchers obtained clutch-size and habitat data for over 3,900 lizard species and analyzed the data with statistical models."}'::jsonb, NULL, 'A', NULL, NULL, 30)
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
  VALUES (v_mod, 1, '3-1', 1, 'mcq', NULL, NULL, '$k + 12 = 336$

What is the solution to the given equation?', '{"A":"28","B":"324","C":"348","D":"4,032"}'::jsonb, NULL, 'B', NULL, NULL, 32)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '3-2', 2, 'mcq', NULL, NULL, 'The function $f$ is defined by $f(x) = x^3 + 15$. What is the value of $f(2)$ ?', '{"A":"20","B":"21","C":"23","D":"24"}'::jsonb, NULL, 'C', NULL, NULL, 32)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '3-3', 3, 'mcq', NULL, NULL, 'Sean rents a tent at a cost of $11 per day plus a onetime insurance fee of $10. Which equation represents the total cost $c$, in dollars, to rent the tent with insurance for $d$ days?', '{"A":"$c = 11(d + 10)$","B":"$c = 10(d + 11)$","C":"$c = 11d + 10$","D":"$c = 10d + 11$"}'::jsonb, NULL, 'C', NULL, NULL, 32)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '3-4', 4, 'mcq', NULL, 'A transversal line labeled ℓ crosses two parallel vertical lines labeled m and n (m on the left, n on the right), descending from upper-left to lower-right. The angle the transversal makes at line m, above the transversal and to the right, is labeled x°. The angle the transversal makes at line n, below the transversal, is labeled 26°. Note: Figure not drawn to scale.', 'In the figure shown, line $m$ is parallel to line $n$. What is the value of $x$ ?', '{"A":"13","B":"26","C":"52","D":"154"}'::jsonb, '/data/tests/cb-og-3/figures/m3-q4.png', 'D', NULL, NULL, 32)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '3-5', 5, 'mcq', NULL, NULL, 'John paid a total of $165 for a microscope by making a down payment of $37 plus $p$ monthly payments of $16 each. Which of the following equations represents this situation?', '{"A":"$16p - 37 = 165$","B":"$37p - 16 = 165$","C":"$16p + 37 = 165$","D":"$37p + 16 = 165$"}'::jsonb, NULL, 'C', NULL, NULL, 32)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '3-6', 6, 'grid', NULL, NULL, 'If $y = 5x + 10$, what is the value of $y$ when $x = 8$ ?', NULL, NULL, '50', '["50"]'::jsonb, NULL, 33)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '3-7', 7, 'grid', NULL, 'A vertical bar graph titled with y-axis "Number of cans" (gridlines at 0, 10, 20, 30, 40, 50, 60, 70) and x-axis "Group" (groups 1 through 10). Approximate bar heights: group 1 ≈ 30, group 2 ≈ 63, group 3 ≈ 38, group 4 ≈ 50, group 5 ≈ 47, group 6 ≈ 40, group 7 ≈ 54, group 8 ≈ 60, group 9 ≈ 17, group 10 ≈ 20.', 'The bar graph shows the distribution of 419 cans collected by 10 different groups for a food drive. How many cans were collected by group 6?', NULL, '/data/tests/cb-og-3/figures/m3-q7.png', '40', '["40"]'::jsonb, NULL, 33)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '3-8', 8, 'mcq', 'The table gives the distribution of votes for a new school mascot and grade level for 80 students. Grade level columns are Sixth, Seventh, Eighth, Total. Badger: 4, 9, 9, 22. Lion: 9, 2, 9, 20. Longhorn: 4, 6, 4, 14. Tiger: 6, 9, 9, 24. Total: 23, 26, 31, 80.', NULL, 'If one of these students is selected at random, what is the probability of selecting a student whose vote for new mascot was for a lion?', '{"A":"$\\dfrac{1}{9}$","B":"$\\dfrac{1}{5}$","C":"$\\dfrac{1}{4}$","D":"$\\dfrac{2}{3}$"}'::jsonb, NULL, 'C', NULL, NULL, 33)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '3-9', 9, 'mcq', NULL, 'A line graph in the first quadrant with a vertical axis labeled y and a horizontal axis labeled x, origin labeled O. A single straight line rises from a positive y-intercept on the y-axis upward to the right at a constant slope (showing a onetime fee plus an hourly rate). No numeric scale shown.', 'The graph represents the total charge, in dollars, by an electrician for $x$ hours of work. The electrician charges a onetime fee plus an hourly rate. What is the best interpretation of the slope of the graph?', '{"A":"The electrician’s hourly rate","B":"The electrician’s onetime fee","C":"The maximum amount that the electrician charges","D":"The total amount that the electrician charges"}'::jsonb, '/data/tests/cb-og-3/figures/m3-q9.png', 'A', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '3-10', 10, 'mcq', NULL, NULL, 'Square X has a side length of 12 centimeters. The perimeter of square Y is 2 times the perimeter of square X. What is the length, in centimeters, of one side of square Y?', '{"A":"6","B":"10","C":"14","D":"24"}'::jsonb, NULL, 'D', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '3-11', 11, 'mcq', NULL, NULL, 'What is the equation of the line that passes through the point $(0, 5)$ and is parallel to the graph of $y = 7x + 4$ in the $xy$-plane?', '{"A":"$y = 5x$","B":"$y = 7x + 5$","C":"$y = 7x$","D":"$y = 5x + 7$"}'::jsonb, NULL, 'B', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '3-12', 12, 'mcq', NULL, NULL, 'In the linear function $h$, $h(0) = 41$ and $h(1) = 40$. Which equation defines $h$ ?', '{"A":"$h(x) = -x + 41$","B":"$h(x) = -x$","C":"$h(x) = -41x$","D":"$h(x) = -41$"}'::jsonb, NULL, 'A', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '3-13', 13, 'grid', NULL, NULL, 'The function $f(t) = 60{,}000(2)^{\frac{t}{410}}$ gives the number of bacteria in a population $t$ minutes after an initial observation. How much time, in minutes, does it take for the number of bacteria in the population to double?', NULL, NULL, '410', '["410"]'::jsonb, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '3-14', 14, 'grid', NULL, NULL, 'The function $f$ is defined by $f(x) = (x - 6)(x - 2)(x + 6)$. In the $xy$-plane, the graph of $y = g(x)$ is the result of translating the graph of $y = f(x)$ up 4 units. What is the value of $g(0)$ ?', NULL, NULL, '76', '["76"]'::jsonb, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '3-15', 15, 'mcq', NULL, NULL, 'A candle is made of 17 ounces of wax. When the candle is burning, the amount of wax in the candle decreases by 1 ounce every 4 hours. If 6 ounces of wax remain in this candle, for how many hours has it been burning?', '{"A":"3","B":"6","C":"24","D":"44"}'::jsonb, NULL, 'D', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '3-16', 16, 'mcq', NULL, NULL, '$14j + 5k = m$

The given equation relates the numbers $j$, $k$, and $m$. Which equation correctly expresses $k$ in terms of $j$ and $m$ ?', '{"A":"$k = \\dfrac{m - 14j}{5}$","B":"$k = \\dfrac{1}{5}m - 14j$","C":"$k = \\dfrac{14j - m}{5}$","D":"$k = 5m - 14j$"}'::jsonb, NULL, 'A', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '3-17', 17, 'mcq', NULL, NULL, 'Triangle $FGH$ is similar to triangle $JKL$, where angle $F$ corresponds to angle $J$ and angles $G$ and $K$ are right angles. If $\sin(F) = \dfrac{308}{317}$, what is the value of $\sin(J)$ ?', '{"A":"$\\dfrac{75}{317}$","B":"$\\dfrac{308}{317}$","C":"$\\dfrac{317}{308}$","D":"$\\dfrac{317}{75}$"}'::jsonb, NULL, 'B', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '3-18', 18, 'mcq', NULL, NULL, 'The product of two positive integers is 546. If the first integer is 11 greater than twice the second integer, what is the smaller of the two integers?', '{"A":"7","B":"14","C":"39","D":"78"}'::jsonb, NULL, 'B', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '3-19', 19, 'mcq', NULL, NULL, '$y \le x + 7$
$y \ge -2x - 1$

Which point $(x, y)$ is a solution to the given system of inequalities in the $xy$-plane?', '{"A":"$(-14, 0)$","B":"$(0, -14)$","C":"$(0, 14)$","D":"$(14, 0)$"}'::jsonb, NULL, 'D', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '3-20', 20, 'grid', NULL, NULL, '$(x - 2)^2 = 3x + 34$

What is the smallest solution to the given equation?', NULL, NULL, '-3', '["-3"]'::jsonb, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '3-21', 21, 'grid', NULL, NULL, 'The regular price of a shirt at a store is $11.70. The sale price of the shirt is 80% less than the regular price, and the sale price is 30% greater than the store’s cost for the shirt. What was the store’s cost, in dollars, for the shirt?', NULL, NULL, '1.8', '["1.8","9/5"]'::jsonb, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '3-22', 22, 'mcq', NULL, NULL, 'A sample of oak has a density of 807 kilograms per cubic meter. The sample is in the shape of a cube, where each edge has a length of 0.90 meters. To the nearest whole number, what is the mass, in kilograms, of this sample?', '{"A":"588","B":"726","C":"897","D":"1,107"}'::jsonb, NULL, 'A', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '3-23', 23, 'mcq', NULL, NULL, 'For $x > 0$, the function $f$ is defined as follows:

$f(x)$ equals 201% of $x$

Which of the following could describe this function?', '{"A":"Decreasing exponential","B":"Decreasing linear","C":"Increasing exponential","D":"Increasing linear"}'::jsonb, NULL, 'D', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '3-24', 24, 'mcq', NULL, 'An xy-coordinate grid with x-axis from about -10 to 0 and y-axis from about 0 down to -10 (y-axis labeled at top, x-axis to the right, origin O at upper right). A curve enters near (-10, -0.7), stays close to the x-axis on the left, then curves sharply downward as x increases, dropping steeply near x = -4 toward y = -10. The curve approaches a vertical asymptote around x = -4.', 'The rational function $f$ is defined by an equation in the form $f(x) = \dfrac{a}{x + b}$, where $a$ and $b$ are constants. The partial graph of $y = f(x)$ is shown. If $g(x) = f(x + 4)$, which equation could define function $g$ ?', '{"A":"$g(x) = \\dfrac{6}{x}$","B":"$g(x) = \\dfrac{6}{x + 4}$","C":"$g(x) = \\dfrac{6}{x + 8}$","D":"$g(x) = \\dfrac{6(x + 4)}{x + 4}$"}'::jsonb, '/data/tests/cb-og-3/figures/m3-q24.png', 'C', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '3-25', 25, 'mcq', NULL, NULL, 'Which expression is equivalent to $\dfrac{y + 12}{x - 8} + \dfrac{y(x - 8)}{x^2 y - 8xy}$ ?', '{"A":"$\\dfrac{xy + y + 4}{x^3 y - 16x^2 y + 64xy}$","B":"$\\dfrac{xy + 9y + 12}{x^2 y - 8xy + x - 8}$","C":"$\\dfrac{xy^2 + 13xy - 8y}{x^2 y - 8xy}$","D":"$\\dfrac{xy^2 + 13xy - 8y}{x^3 y - 16x^2 y + 64xy}$"}'::jsonb, NULL, 'C', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '3-26', 26, 'mcq', 'Poll Results — Angel Cruz: 483; Terry Smith: 320.', NULL, 'The table shows the results of a poll. A total of 803 voters selected at random were asked which candidate they would vote for in the upcoming election. According to the poll, if 6,424 people vote in the election, by how many votes would Angel Cruz be expected to win?', '{"A":"163","B":"1,304","C":"3,864","D":"5,621"}'::jsonb, NULL, 'B', NULL, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '3-27', 27, 'grid', NULL, NULL, 'The graph of $x^2 + x + y^2 + y = \dfrac{199}{2}$ in the $xy$-plane is a circle. What is the length of the circle’s radius?', NULL, NULL, '10', '["10"]'::jsonb, NULL, 38)
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
  VALUES (v_mod, 1, '4-1', 1, 'mcq', NULL, NULL, 'Isabel grows potatoes in her garden. This year, she harvested 760 potatoes and saved 10% of them to plant next year. How many of the harvested potatoes did Isabel save to plant next year?', '{"A":"66","B":"76","C":"84","D":"86"}'::jsonb, NULL, 'B', NULL, NULL, 42)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '4-2', 2, 'mcq', NULL, 'An exponential-type curve is plotted in the xy-plane on a grid with both axes labeled from about -5 to 10. The curve rises steeply from left to right, crossing the y-axis at the point (0, 2).', 'What is the $y$-intercept of the graph shown?', '{"A":"$(0, 0)$","B":"$(0, 2)$","C":"$(2, 0)$","D":"$(2, 2)$"}'::jsonb, '/data/tests/cb-og-3/figures/m4-q2.png', 'B', NULL, NULL, 42)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '4-3', 3, 'mcq', NULL, NULL, 'What length, in centimeters, is equivalent to a length of 51 meters? (1 meter = 100 centimeters)', '{"A":"0.051","B":"0.51","C":"5,100","D":"51,000"}'::jsonb, NULL, 'C', NULL, NULL, 42)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '4-4', 4, 'mcq', NULL, NULL, 'A bus is traveling at a constant speed along a straight portion of road. The equation $d = 30t$ gives the distance $d$, in feet from a road marker, that the bus will be $t$ seconds after passing the marker. How many feet from the marker will the bus be 2 seconds after passing the marker?', '{"A":"30","B":"32","C":"60","D":"90"}'::jsonb, NULL, 'C', NULL, NULL, 42)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '4-5', 5, 'mcq', NULL, NULL, 'Which expression is equivalent to $20w - (4w + 3w)$ ?', '{"A":"$10w$","B":"$13w$","C":"$19w$","D":"$21w$"}'::jsonb, NULL, 'B', NULL, NULL, 42)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '4-6', 6, 'grid', NULL, NULL, 'If $6 + x = 9$, what is the value of $18 + 3x$ ?', NULL, NULL, '27', '["27"]'::jsonb, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '4-7', 7, 'grid', '$y = x^2 - 14x + 22$', NULL, 'The given equation relates the variables $x$ and $y$. For what value of $x$ does the value of $y$ reach its minimum?', NULL, NULL, '7', '["7"]'::jsonb, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '4-8', 8, 'mcq', NULL, NULL, 'Which expression is equivalent to $9x^2 + 5x$ ?', '{"A":"$x(9x + 5)$","B":"$5x(9x + 1)$","C":"$9x(x + 5)$","D":"$x^2(9x + 5)$"}'::jsonb, NULL, 'A', NULL, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '4-9', 9, 'mcq', NULL, NULL, 'In triangle $ABC$, the measure of angle $B$ is $52°$ and the measure of angle $C$ is $17°$. What is the measure of angle $A$ ?', '{"A":"$21°$","B":"$35°$","C":"$69°$","D":"$111°$"}'::jsonb, NULL, 'D', NULL, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '4-10', 10, 'mcq', '$x = 8$
$y = x^2 + 8$', NULL, 'The graphs of the equations in the given system of equations intersect at the point $(x, y)$ in the $xy$-plane. What is the value of $y$ ?', '{"A":"8","B":"24","C":"64","D":"72"}'::jsonb, NULL, 'D', NULL, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '4-11', 11, 'mcq', 'The scatterplot shows the relationship between two variables, $x$ and $y$. A line of best fit is also shown.', 'A scatterplot in the first quadrant with the x-axis labeled from 0 to 14 and the y-axis labeled from 0 to about 15. Several data points are scattered with an overall decreasing trend. A line of best fit is drawn that starts near (0, 13.5) and slopes downward to the right with a negative slope of about -0.8, passing near (14, 2).', 'Which of the following equations best represents the line of best fit shown?', '{"A":"$y = 13.5 + 0.8x$","B":"$y = 13.5 - 0.8x$","C":"$y = -13.5 + 0.8x$","D":"$y = -13.5 - 0.8x$"}'::jsonb, '/data/tests/cb-og-3/figures/m4-q11.png', 'B', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '4-12', 12, 'mcq', NULL, NULL, 'The function $f$ is defined by $f(x) = 8\sqrt{x}$. For what value of $x$ does $f(x) = 48$ ?', '{"A":"6","B":"8","C":"36","D":"64"}'::jsonb, NULL, 'C', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '4-13', 13, 'grid', NULL, NULL, 'A circle has center $O$, and points $R$ and $S$ lie on the circle. In triangle $ORS$, the measure of $\angle ROS$ is $88°$. What is the measure of $\angle RSO$, in degrees?', NULL, NULL, '46', '["46"]'::jsonb, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '4-14', 14, 'grid', '$x(x + 1) - 56 = 4x(x - 7)$', NULL, 'What is the sum of the solutions to the given equation?', NULL, NULL, '29/3', '["29/3","9.666","9.667"]'::jsonb, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '4-15', 15, 'mcq', '$y = 3x$
$2x + y = 12$', NULL, 'The solution to the given system of equations is $(x, y)$. What is the value of $5x$ ?', '{"A":"24","B":"15","C":"12","D":"5"}'::jsonb, NULL, 'C', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '4-16', 16, 'mcq', NULL, NULL, 'A cube has an edge length of 41 inches. What is the volume, in cubic inches, of the cube?', '{"A":"164","B":"1,681","C":"10,086","D":"68,921"}'::jsonb, NULL, 'D', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '4-17', 17, 'mcq', '$p(t) = 90{,}000(1.06)^t$', NULL, 'The given function $p$ models the population of Lowell $t$ years after a census. Which of the following functions best models the population of Lowell $m$ months after the census?', '{"A":"$r(m) = \\dfrac{90{,}000}{12}(1.06)^m$","B":"$r(m) = 90{,}000\\left(\\dfrac{1.06}{12}\\right)^m$","C":"$r(m) = 90{,}000\\left(\\dfrac{1.06}{12}\\right)^{\\frac{m}{12}}$","D":"$r(m) = 90{,}000(1.06)^{\\frac{m}{12}}$"}'::jsonb, NULL, 'D', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '4-18', 18, 'mcq', '$6x + 7y = 28$
$2x + 2y = 10$', NULL, 'The solution to the given system of equations is $(x, y)$. What is the value of $y$ ?', '{"A":"$-2$","B":"7","C":"14","D":"18"}'::jsonb, NULL, 'A', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '4-19', 19, 'mcq', NULL, NULL, 'The minimum value of $x$ is 12 less than 6 times another number $n$. Which inequality shows the possible values of $x$ ?', '{"A":"$x \\le 6n - 12$","B":"$x \\ge 6n - 12$","C":"$x \\le 12 - 6n$","D":"$x \\ge 12 - 6n$"}'::jsonb, NULL, 'B', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '4-20', 20, 'grid', NULL, NULL, 'Data set A consists of the heights of 75 buildings and has a mean of 32 meters. Data set B consists of the heights of 50 buildings and has a mean of 62 meters. Data set C consists of the heights of the 125 buildings from data sets A and B. What is the mean, in meters, of data set C?', NULL, NULL, '44', '["44"]'::jsonb, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '4-21', 21, 'grid', NULL, NULL, 'The graph of $9x - 10y = 19$ is translated down 4 units in the $xy$-plane. What is the $x$-coordinate of the $x$-intercept of the resulting graph?', NULL, NULL, '59/9', '["59/9","6.555","6.556"]'::jsonb, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '4-22', 22, 'mcq', NULL, NULL, 'Two variables, $x$ and $y$, are related such that for each increase of 1 in the value of $x$, the value of $y$ increases by a factor of 4. When $x = 0$, $y = 200$. Which equation represents this relationship?', '{"A":"$y = 4(x)^{200}$","B":"$y = 4(200)^x$","C":"$y = 200(x)^4$","D":"$y = 200(4)^x$"}'::jsonb, NULL, 'D', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '4-23', 23, 'mcq', '$x^2 - 2x - 9 = 0$', NULL, 'One solution to the given equation can be written as $1 + \sqrt{k}$, where $k$ is a constant. What is the value of $k$ ?', '{"A":"8","B":"10","C":"20","D":"40"}'::jsonb, NULL, 'B', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '4-24', 24, 'mcq', NULL, 'Two dot plots side by side, labeled Data Set A and Data Set B, sharing a horizontal value axis labeled from 10 through 18. Each dot plot shows the frequency distribution of values as stacked dots above the value axis; the two distributions appear similar in spread and center.', 'The dot plots represent the distributions of values in data sets A and B.

Which of the following statements must be true?
I. The median of data set A is equal to the median of data set B.
II. The standard deviation of data set A is equal to the standard deviation of data set B.', '{"A":"I only","B":"II only","C":"I and II","D":"Neither I nor II"}'::jsonb, '/data/tests/cb-og-3/figures/m4-q24.png', 'A', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '4-25', 25, 'mcq', NULL, NULL, 'An isosceles right triangle has a perimeter of $94 + 94\sqrt{2}$ inches. What is the length, in inches, of one leg of this triangle?', '{"A":"47","B":"$47\\sqrt{2}$","C":"94","D":"$94\\sqrt{2}$"}'::jsonb, NULL, 'B', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '4-26', 26, 'mcq', '$-9x^2 + 30x + c = 0$', NULL, 'In the given equation, $c$ is a constant. The equation has exactly one solution. What is the value of $c$ ?', '{"A":"3","B":"0","C":"$-25$","D":"$-53$"}'::jsonb, NULL, 'C', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '4-27', 27, 'grid', '$\dfrac{3}{2}y - \dfrac{1}{4}x = \dfrac{2}{3} - \dfrac{3}{2}y$
$\dfrac{1}{2}x + \dfrac{3}{2} = py + \dfrac{9}{2}$', NULL, 'In the given system of equations, $p$ is a constant. If the system has no solution, what is the value of $p$ ?', NULL, NULL, '6', '["6"]'::jsonb, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
END $seed$;
