-- =============================================================================
-- Migration: 0164_seed_cb_og_1.sql
-- Purpose:   Seed "CB OG #1" (College Board linear Digital SAT practice test,
--            66 RW + 54 Math = 120 Q) into the full-test tables from 0048.
--   Source:  sat-practice-test-1-digital.pdf; official College Board answer key (pdf/Key/).
--   Idempotent upsert on (slug)/(test_id,position)/(module_id,position).
-- =============================================================================
DO $seed$
DECLARE v_test uuid; v_mod uuid;
BEGIN
  INSERT INTO public.tests (slug, ordinal, title, short_title, source, total_questions)
  VALUES ('cb-og-1', 7, 'CB OG #1', 'CB OG #1', 'sat-practice-test-1-digital.pdf', 120)
  ON CONFLICT (slug) DO UPDATE SET ordinal=EXCLUDED.ordinal, title=EXCLUDED.title,
    short_title=EXCLUDED.short_title, source=EXCLUDED.source, total_questions=EXCLUDED.total_questions
  RETURNING id INTO v_test;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 1, 'reading-writing', 'Reading and Writing — Module 1', 1920, 33)
  ON CONFLICT (test_id, position) DO UPDATE SET section=EXCLUDED.section, label=EXCLUDED.label,
    time_limit_seconds=EXCLUDED.time_limit_seconds, question_count=EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '1-1', 1, 'mcq', 'Former astronaut Ellen Ochoa says that although she doesn''t have a definite idea of when it might happen, she ______ that humans will someday need to be able to live in other environments than those found on Earth. This conjecture informs her interest in future research missions to the moon.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"demands","B":"speculates","C":"doubts","D":"establishes"}'::jsonb, NULL, 'B', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '1-2', 2, 'mcq', 'Beginning in the 1950s, Navajo Nation legislator Annie Dodge Wauneka continuously worked to promote public health; this ______ effort involved traveling throughout the vast Navajo homeland and writing a medical dictionary for speakers of Diné bizaad, the Navajo language.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"imperial","B":"offhand","C":"persistent","D":"mandatory"}'::jsonb, NULL, 'C', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '1-3', 3, 'mcq', 'Following the principles of community-based participatory research, tribal nations and research institutions are equal partners in health studies conducted on reservations. A collaboration between the Crow Tribe and Montana State University ______ this model: tribal citizens worked alongside scientists to design the methodology and continue to assist in data collection.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"circumvents","B":"eclipses","C":"fabricates","D":"exemplifies"}'::jsonb, NULL, 'D', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '1-4', 4, 'mcq', 'The parasitic dodder plant increases its reproductive success by flowering at the same time as the host plant it has latched onto. In 2020, Jianqiang Wu and his colleagues determined that the tiny dodder achieves this ______ with its host by absorbing and utilizing a protein the host produces when it is about to flower.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"synchronization","B":"hibernation","C":"prediction","D":"moderation"}'::jsonb, NULL, 'A', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '1-5', 5, 'mcq', 'Given that the conditions in binary star systems should make planetary formation nearly impossible, it''s not surprising that the existence of planets in such systems has lacked ______ explanation. Roman Rafikov and Kedron Silsbee shed light on the subject when they used modeling to demonstrate a complex set of factors that could support planets'' development.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"a discernible","B":"a straightforward","C":"an inconclusive","D":"an unbiased"}'::jsonb, NULL, 'B', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '1-6', 6, 'mcq', 'Seminole/Muscogee director Sterlin Harjo ______ television''s tendency to make Native characters in the distant past: this rejection is evident in his series Reservation Dogs, which revolves around teenagers who dress in contemporary styles and whose dialogue is laced with current slang.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"repudiates","B":"proclaims","C":"foretells","D":"recasts"}'::jsonb, NULL, 'A', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '1-7', 7, 'mcq', 'In 2007, computer scientist Luis von Ahn was working on converting printed books into a digital format. He found that some words were distorted enough that digital scanners couldn''t recognize them, but most humans could easily read them. Based on that finding, von Ahn invented a simple security test to keep automated "bots" out of websites. The first version of the reCAPTCHA test asked users to type one known word and one of the many words scanners couldn''t recognize. Correct answers proved the users were humans and added data to the book-digitizing project.', NULL, 'Which choice best states the main purpose of the text?', '{"A":"To discuss von Ahn''s invention of reCAPTCHA","B":"To explain how digital scanners work","C":"To call attention to von Ahn''s book-digitizing project","D":"To describe how popular reCAPTCHA is"}'::jsonb, NULL, 'A', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '1-8', 8, 'mcq', 'The following text is from Edith Wharton''s 1905 novel The House of Mirth. Lily Bart and a companion are walking through a park.

 Lily had no real intimacy with nature, but she had a passion for the appropriate and could be keenly sensitive to a scene which was the fitting background of her own sensations. The landscape outspread before her seemed an enlargement of her present mood, and she found something of herself in its calmness, its breadth, its long free reaches. On the nearer slopes the sugar maples wavered like pyres of light, lower down was a massing of grey orchards, and here and there the lingering green of an oak-grove.', NULL, 'Which choice best describes the function of the underlined sentence in the text as a whole?', '{"A":"It creates a detailed image of the physical setting of the scene.","B":"It establishes that a character is experiencing an internal conflict.","C":"It makes an assertion that the next sentence then expands on.","D":"It illustrates an idea that is introduced in the previous sentence."}'::jsonb, NULL, 'D', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '1-9', 9, 'mcq', 'A study by a team including finance professor Madhu Veeraraghavan suggests that exposure to sunshine during the workday can lead to overly optimistic behavior. Using data spanning from 1994 to 2010 for a set of US companies, the team compared over 29,000 annual earnings forecasts to the actual earnings later reported by those companies. The team found that the greater the exposure to sunshine at work in the two weeks before a manager submitted an earnings forecast, the more the manager''s forecast exceeded what the company actually earned that year.', NULL, 'Which choice best states the function of the underlined sentence in the overall structure of the text?', '{"A":"To summarize the results of the team''s analysis","B":"To present a specific example that illustrates the study''s findings","C":"To explain part of the methodology used in the team''s study","D":"To call out a challenge the team faced in conducting its analysis"}'::jsonb, NULL, 'C', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '1-10', 10, 'mcq', 'The following text is adapted from Edith Nesbit''s 1906 novel The Railway Children.

 Mother did not spend all her time in paying dull [visits] to dull ladies, and sitting dully at home waiting for dull ladies to pay [visits] to her. She was almost always there, ready to play with the children, and read to them, and help them to do their home-lessons. Besides this she used to write stories for them while they were at school, and read them aloud after tea, and she always made up funny pieces of poetry for their birthdays and for other great occasions.', NULL, 'According to the text, what is true about Mother?', '{"A":"She wishes that more ladies would visit her.","B":"Birthdays are her favorite special occasion.","C":"She creates stories and poems for her children.","D":"Reading to her children is her favorite activity."}'::jsonb, NULL, 'C', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '1-11', 11, 'mcq', 'The following text is from Maggie Pogue Johnson''s 1910 poem "Poet of Our Race." In this poem, the speaker is addressing Paul Laurence Dunbar, a Black author.

 Thou, with stroke of mighty pen,
 Hast told of joy and mirth,
 And read the hearts and souls of men
 As cradled from their birth.
 The language of the flowers,
 Thou hast read them all,
 And e''en the little brook
 Responded to thy call.', NULL, 'Which choice best states the main purpose of the text?', '{"A":"To praise a certain writer for being especially perceptive regarding people and nature","B":"To establish that a certain writer has read extensively about a variety of topics","C":"To call attention to a certain writer''s careful and elaborately detailed writing process","D":"To recount fond memories of an afternoon spent in nature with a certain writer"}'::jsonb, NULL, 'A', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '1-12', 12, 'mcq', '"To You" is an 1856 poem by Walt Whitman. In the poem, Whitman suggests that readers, whom he addresses directly, have not fully understood themselves, writing, ______', NULL, 'Which quotation from "To You" most effectively illustrates the claim?', '{"A":"\"You have not known what you are, you have slumber''d upon yourself / all your life, / Your eyelids have been the same as closed most of the time.\"","B":"\"These immense meadows, these interminable rivers, you are immense / and interminable as they.\"","C":"\"I should have made my way straight to you long ago, / I should have blabb''d nothing but you, I should have chanted nothing / but you.\"","D":"\"I will leave all and come and make the hymns of you, / None has understood you, but I understand you.\""}'::jsonb, NULL, 'A', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '1-13', 13, 'mcq', 'Born in 1891 to a Quechua-speaking family in the Andes Mountains of Peru, Martín Chambi is today considered to be one of the most renowned figures of Latin American photography. In a paper for an art history class, a student claims that Chambi''s photographs have considerable ethnographic value—in his work, Chambi was able to capture diverse elements of Peruvian society, representing his subjects with both dignity and authenticity.', NULL, 'Which finding, if true, would most directly support the student''s claim?', '{"A":"Chambi took many commissioned portraits of wealthy Peruvians, but he also produced hundreds of images carefully documenting the peoples, sites, and customs of Indigenous communities of the Andes.","B":"Chambi''s photographs demonstrate a high level of technical skill, as seen in his unique use of illumination to create dramatic light and shadow contrasts.","C":"During his lifetime, Chambi was known and celebrated both within and outside his native Peru, as his work was published in places like Argentina, Spain, and Mexico.","D":"Some of the peoples and places Chambi photographed had long been popular subjects for Peruvian photographers."}'::jsonb, NULL, 'A', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '1-14', 14, 'mcq', 'Credited Film Output of James Young Deer, Dark Cloud, Edwin Carewe, and Lillian St. Cyr
Individual | Years active | Number of films known and commonly credited
James Young Deer | 1909–1924 | 33 (actor), 35 (director), 10 (writer)
Dark Cloud | 1910–1920 | 35 (actor), 1 (writer)
Edwin Carewe | 1912–1934 | 47 (actor), 58 (director), 20 (producer), 4 (writer)
Lillian St. Cyr (Red Wing) | 1908–1921 | 66 (actor)

Some researchers studying Indigenous actors and filmmakers in the United States have turned their attention to the early days of cinema, particularly the 1910s and 1920s, when people like James Young Deer, Dark Cloud, Edwin Carewe, and Lillian St. Cyr (known professionally as Red Wing) were involved in one way or another with numerous films. In fact, so many films and associated records for this era have been lost that counts of those four figures'' output should be taken as bare minimums rather than totals; it''s entirely possible, for example, that ______', NULL, 'Which choice most effectively uses data from the table to complete the example?', '{"A":"Dark Cloud acted in significantly fewer films than did Lillian St. Cyr, who is credited with 66 performances.","B":"Edwin Carewe''s 47 credited acting roles includes only films made after 1934.","C":"Lillian St. Cyr acted in far more than 66 films and Edwin Carewe directed more than 58.","D":"James Young Deer actually directed 33 films and acted in only 10."}'::jsonb, NULL, 'C', NULL, NULL, 9)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '1-15', 15, 'mcq', 'Juvenile Plants Found Growing on Bare Ground and in Patches of Vegetation for Five Species
Species | Bare ground | Patches of vegetation | Total | Percent found in patches of vegetation
T. moroderi | 9 | 13 | 22 | 59.1%
T. libanitis | 83 | 120 | 203 | 59.1%
H. syriacum | 95 | 106 | 201 | 52.7%
H. squamatum | 218 | 321 | 539 | 59.6%
H. stoechas | 11 | 12 | 23 | 52.2%

Alicia Montesinos-Navarro, Isabelle Storer, and Rocío Pérez-Barrales recently examined several plots within a diverse plant community in southeast Spain. The researchers calculated that if individual plants were randomly distributed on this particular landscape, only about 15% would be with other plants in patches of vegetation. They counted the number of juvenile plants of five species growing in patches of vegetation and the number growing alone on bare ground and compared those numbers to what would be expected if the plants were randomly distributed. Based on these results, they claim that plants of these species that grow in close proximity to other plants gain an advantage at an early developmental stage.', NULL, 'Which choice best describes data from the table that support the researchers'' claim?', '{"A":"For all five species, less than 75% of juvenile plants were growing in patches of vegetation.","B":"The species with the greatest number of juvenile plants growing in patches of vegetation was H. stoechas.","C":"For T. libanitis and T. moroderi, the percentage of juvenile plants growing in patches of vegetation was less than what would be expected if plants were randomly distributed.","D":"For each species, the percentage of juvenile plants growing in patches of vegetation was substantially higher than what would be expected if plants were randomly distributed."}'::jsonb, NULL, 'D', NULL, NULL, 10)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '1-16', 16, 'mcq', 'In the mountains of Brazil, Barbacenia tomentosa and Barbacenia macrantha—two plants in the Velloziaceae family—establish themselves on barren, nutrient-poor patches of quartzitic rock. Plant ecologists Anna Abrahão and Patricia de Britto Costa used microscopic analysis to determine that the roots of B. tomentosa and B. macrantha, which grow directly into the quartzite, have clusters of fine hairs near the root tip; further analysis indicated that these hairs secrete both malic and citric acids. The researchers hypothesize that the plants depend on dissolving underlying rock with these acids, as the process not only creates channels for continued growth but also releases phosphates that provide the vital nutrient phosphorus.', NULL, 'Which finding, if true, would most directly support the researchers'' hypothesis?', '{"A":"Other species in the Velloziaceae family are found in terrains with more soil but have root structures similar to those of B. tomentosa and B. macrantha.","B":"Though B. tomentosa and B. macrantha both secrete citric and malic acids, each species produces the acids in different proportions.","C":"The roots of B. tomentosa and B. macrantha carve new entry points into rocks even when cracks in the surface are readily available.","D":"B. tomentosa and B. macrantha thrive even when transferred to the surfaces of rocks that do not contain phosphates."}'::jsonb, NULL, 'C', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '1-17', 17, 'mcq', 'Herbivorous sauropod dinosaurs could grow more than 100 feet long and weigh up to 80 tons, and some researchers have attributed the evolution of sauropods to such massive sizes to increased plant production resulting from high levels of atmospheric carbon dioxide during the Mesozoic era. However, there is no evidence of significant spikes in carbon dioxide levels coinciding with relevant periods in sauropod evolution, such as when the first large sauropods appeared, when several sauropod lineages underwent further evolution toward gigantism, or when sauropods reached their maximum known sizes, suggesting that ______', NULL, 'Which choice most logically completes the text?', '{"A":"fluctuations in atmospheric carbon dioxide affected different sauropod lineages differently.","B":"the evolution of larger body sizes in sauropods did not depend on increased atmospheric carbon dioxide.","C":"atmospheric carbon dioxide was higher when the largest known sauropods lived than it was when the first sauropods appeared.","D":"sauropods probably would not have evolved to such immense sizes if atmospheric carbon dioxide had been even slightly higher."}'::jsonb, NULL, 'B', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '1-18', 18, 'mcq', 'In documents called judicial opinions, judges explain the reasoning behind their legal rulings, and in those explanations they sometimes cite and discuss historical and contemporary philosophers. Legal scholar and philosopher Anita L. Allen argues that while judges are naturally inclined to mention philosophers whose views align with their own positions, the strongest judicial opinions consider and rebut potential objections, discussing philosophers whose views conflict with judges'' views could therefore ______', NULL, 'Which choice most logically completes the text?', '{"A":"allow judges to craft the kind of robust judicial opinions without needing to consult philosophical works.","B":"help judges improve the arguments they put forward in their judicial opinions.","C":"make judicial opinions more comprehensible to readers without legal or philosophical training.","D":"bring judicial opinions in line with views that are broadly held among philosophers."}'::jsonb, NULL, 'B', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '1-19', 19, 'mcq', 'Public-awareness campaigns about the need to reduce single-use plastics can be successful, says researcher Kim Borg of Monash University in Australia, when these campaigns give consumers a choice: for example, Japan achieved a 40 percent reduction in plastic-bag use after cashiers were instructed to ask customers whether ______ wanted a bag.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"they","B":"one","C":"you","D":"it"}'::jsonb, NULL, 'A', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '1-20', 20, 'mcq', 'In ancient Greece, an Epicurean was a follower of Epicurus, a philosopher whose beliefs revolved around the pursuit of pleasure. Epicurus defined pleasure as "the absence of pain in the body and of trouble in the ______ that all life''s virtues derived from this absence.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"soul,\" positing","B":"soul\"; positing","C":"soul\", positing","D":"soul.\" Positing"}'::jsonb, NULL, 'A', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '1-21', 21, 'mcq', 'British scientists James Watson and Francis Crick won the Nobel Prize in part for their 1953 paper announcing the double helix structure of DNA, but it is misleading to say that Watson and Crick discovered the double helix. ______ findings were based on a famous X-ray image of DNA fibers, "Photo 51," developed by X-ray crystallographer Rosalind Franklin and her graduate student Raymond Gosling.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"They''re","B":"It''s","C":"Their","D":"Its"}'::jsonb, NULL, 'C', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '1-22', 22, 'mcq', 'In 1957, Chinese American screen actor Anna May Wong, who had portrayed numerous villains and secondary characters but never a heroine, finally got a starring role in Paramount Pictures'' Daughter of Shanghai, a film that ______ "expanded the range of possibilities for Asian images on screen."', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"critic, Stina Chyn, claims","B":"critic, Stina Chyn, claims,","C":"critic Stina Chyn claims","D":"critic Stina Chyn, claims,"}'::jsonb, NULL, 'C', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '1-23', 23, 'mcq', 'In 1637, the price of tulips skyrocketed in Amsterdam, with single bulbs of rare varieties selling for up to the equivalent of $200,000 in today''s US dollars. Some historians ______ that this "tulip mania" was the first historical instance of an asset bubble, which occurs when investors drive prices to highs not supported by actual demand.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"claiming","B":"claim","C":"having claimed","D":"to claim"}'::jsonb, NULL, 'B', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '1-24', 24, 'mcq', 'Researchers studying magnetosensation have determined why some soil-dwelling roundworms in the Southern Hemisphere move in the opposite direction of Earth''s magnetic field when searching for ______ in the Northern Hemisphere, the magnetic field points down, into the ground, but in the Southern Hemisphere, it points up, toward the surface and away from worms'' food sources.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"food:","B":"food,","C":"food while","D":"food"}'::jsonb, NULL, 'A', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '1-25', 25, 'mcq', 'Scientists believe that, unlike most other species of barnacle, turtle barnacles (Chelonibia testudinari) can dissolve the cement-like secretions they use to attach ______ to a sea turtle shell, enabling the barnacles to move short distances across the shell''s surface.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"it","B":"themselves","C":"them","D":"itself"}'::jsonb, NULL, 'B', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '1-26', 26, 'mcq', 'The classic children''s board game Chutes and Ladders is a version of an ancient Nepalese game, Paramapada Sopanapata. In both games, players encounter "good" or "bad" spaces while traveling along a path; landing on one of the good spaces ______ a player to skip ahead and arrive closer to the end goal.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"allows","B":"are allowing","C":"have allowed","D":"allow"}'::jsonb, NULL, 'A', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '1-27', 27, 'mcq', 'In 1943, in the midst of World War II, mathematics professor Grace Hopper was recruited by the US military to help the war effort by solving complex equations. Hopper''s subsequent career would involve more than just ______ as a pioneering computer programmer, Hopper would help usher in the digital age.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"equations, though","B":"equations, though,","C":"equations. Though,","D":"equations though"}'::jsonb, NULL, 'A', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 28, '1-28', 28, 'mcq', 'In 1453, English King Henry VI became unfit to rule after falling gravely ill. As a result, Parliament appointed Richard, Third Duke of York, who had a strong claim to the English throne, to rule as Lord Protector. Upon recovering two years later, ______ forcing an angered Richard from the royal court and precipitating a series of battles later known as the Wars of the Roses.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"Henry resumed his reign,","B":"the reign of Henry resumed,","C":"Henry''s reign resumed,","D":"it was Henry who resumed his reign,"}'::jsonb, NULL, 'A', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 29, '1-29', 29, 'mcq', 'Although novels and poems are considered distinct literary forms, many authors have created hybrid works that incorporate elements of both. Bernardine Evaristo''s The Emperor''s Babe, ______ is a verse novel, a book-length narrative complete with characters and a plot but conveyed in short, crisp lines of poetry rather than prose.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"by contrast,","B":"consequently,","C":"secondly,","D":"for example,"}'::jsonb, NULL, 'D', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 30, '1-30', 30, 'mcq', 'At two weeks old, the time their critical socialization period begins, wolves can smell but cannot yet see or hear. Domesticated dogs, ______ can see, hear, and smell by the end of two weeks. This relative lack of sensory input may help explain why wolves behave so differently around humans than dogs do: from a very young age, wolves are more wary and less exploratory.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"in other words,","B":"for instance,","C":"by contrast,","D":"accordingly,"}'::jsonb, NULL, 'C', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 31, '1-31', 31, 'mcq', 'Researchers Helena Mihaljević-Brandt, Lucía Santamaría, and Marco Tullney report that while mathematicians may have traditionally worked alone, evidence points to a shift in the opposite direction. ______ mathematicians are choosing to collaborate with their peers—a trend illustrated by a rise in the number of mathematics publications credited to multiple authors.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Similarly,","B":"For this reason,","C":"Furthermore,","D":"Increasingly,"}'::jsonb, NULL, 'D', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 32, '1-32', 32, 'mcq', 'While researching a topic, a student has taken the following notes:
• Pterosaurs were flying reptiles that existed millions of years ago.
• In a 2021 study, Anusuya Chinsamy-Turan analyzed fragments of pterosaur jawbones located in the Sahara Desert.
• She was initially unsure if the bones belonged to juvenile or adult pterosaurs.
• She used advanced microscope techniques to determine that the bones had low growth lines relative to the bones of fully grown pterosaurs.
• She concluded that the bones belonged to juveniles.

The student wants to present the study and its findings. Which choice most effectively uses relevant information from the notes to accomplish this goal?', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"In 2021, Chinsamy-Turan analyzed pterosaur jawbones and was initially unsure if the bones belonged to juveniles or adults.","B":"Pterosaur jawbones located in the Sahara Desert were the focus of a 2021 study.","C":"Chinsamy-Turan analyzed fragments of pterosaur jawbones that were located in the Sahara Desert and that totaled millions of years ago.","D":"In a 2021 study, Chinsamy-Turan determined that pterosaur jawbones located in the Sahara Desert had low growth lines and thus belonged to juveniles."}'::jsonb, NULL, 'D', NULL, NULL, 16)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 33, '1-33', 33, 'mcq', 'While researching a topic, a student has taken the following notes:
• African American women played prominent roles in the Civil Rights Movement, including at the famous 1963 March on Washington.
• Civil rights activist Anna Hedgeman, one of the march''s organizers, was a political adviser who had worked for President Truman.
• Civil rights activist Daisy Bates was a well-known journalist and advocate for school desegregation.
• Hedgeman worked behind the scenes to make sure a woman was included in the lineup of speakers at the march.
• Bates was the sole woman to speak, delivering a brief but memorable address to the cheering crowd.

The student wants to compare the two women''s contributions to the March on Washington. Which choice most effectively uses relevant information from the notes to accomplish this goal?', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Hedgeman and Bates contributed to the march in different ways; Bates, for example, delivered a brief but memorable address.","B":"Hedgeman worked in politics and helped organize the march, while Bates was a journalist and school desegregation advocate.","C":"Although Hedgeman worked behind the scenes to make sure a woman speaker was included, Bates was the sole woman to speak at the march.","D":"Many African American women, including Bates and Hedgeman, fought for civil rights, but only one spoke at the march."}'::jsonb, NULL, 'C', NULL, NULL, 16)
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
  VALUES (v_mod, 1, '2-1', 1, 'mcq', NULL, NULL, 'For painter Jacob Lawrence, being ______ was an important part of his artistic process. Because he paid close attention to all the details of his Harlem neighborhood, Lawrence''s artwork captured nuances in the beauty and vitality of the Black experience during the Harlem Renaissance and the Great Migration.

Which choice completes the text with the most logical and precise word or phrase?', '{"A":"skeptical","B":"observant","C":"critical","D":"confident"}'::jsonb, NULL, 'B', NULL, NULL, 16)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '2-2', 2, 'mcq', NULL, NULL, 'Mônica Lopes-Ferreira and others at Brazil''s Butantan Institute are studying the freshwater stingray species Potamotrygon rex to determine whether biological characteristics such as the rays'' age and sex have ______ effect on the toxicity of their venom—that is, to see if differences in these traits are associated with considerable variations in venom potency.

Which choice completes the text with the most logical and precise word or phrase?', '{"A":"an acceptable","B":"an imperceptible","C":"a negligible","D":"a substantial"}'::jsonb, NULL, 'D', NULL, NULL, 16)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '2-3', 3, 'mcq', NULL, NULL, 'Researchers have struggled to pinpoint specific causes for hiccups, which happen when a person''s diaphragm contracts ______. However, neuroscientist Kimberley Whitehead has found that these uncontrollable contractions may play an important role in helping infants regulate their breathing.

Which choice completes the text with the most logical and precise word or phrase?', '{"A":"involuntarily","B":"beneficially","C":"strenuously","D":"smoothly"}'::jsonb, NULL, 'A', NULL, NULL, 17)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '2-4', 4, 'mcq', NULL, NULL, 'Critics have asserted that fine art and fashion rarely ______ in a world where artists create timeless works for exhibition and designers periodically produce new styles for the public to buy. Luisaviaroma Shoshone-Bannock beadwork artist and designer Jamie Okuma challenges this view: her work can be seen in the Metropolitan Museum of Art and purchased through her online boutique.

Which choice completes the text with the most logical and precise word or phrase?', '{"A":"prevail","B":"succumb","C":"diverge","D":"intersect"}'::jsonb, NULL, 'D', NULL, NULL, 17)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '2-5', 5, 'mcq', NULL, NULL, 'Scholarly discussions of gender in Shakespeare''s comedies often celebrate the rebellion of the playwright''s characters against the rigid expectations ______ by Elizabethan society. Most of the comedies end in marriage, with characters returning to their socially dictated gender roles after previously defying them, but there are some notable exceptions.

Which choice completes the text with the most logical and precise word or phrase?', '{"A":"interjected","B":"committed","C":"illustrated","D":"prescribed"}'::jsonb, NULL, 'D', NULL, NULL, 17)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '2-6', 6, 'mcq', NULL, NULL, 'In studying the use of external stimuli to reduce the itching sensation caused by an allergic histamine response, Louise Ward and colleagues found that while harmless applications of vibration or warming can provide a temporary distraction, such ______ stimuli actually offer less relief than a stimulus that seems less benign, like a mild electric shock.

Which choice completes the text with the most logical and precise word or phrase?', '{"A":"deceptive","B":"innocuous","C":"novel","D":"impractical"}'::jsonb, NULL, 'B', NULL, NULL, 17)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '2-7', 7, 'mcq', NULL, NULL, 'The province of Xoconochco was situated on the Pacific coast, hundreds of kilometers southeast of Tenochtitlan, the capital of the Aztec Empire. Because Xoconochco''s location within the empire was so ______, cacao and other trade goods produced there could reach the capital only after a long overland journey.

Which choice completes the text with the most logical and precise word or phrase?', '{"A":"unobtrusive","B":"concealed","C":"approximate","D":"peripheral"}'::jsonb, NULL, 'D', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '2-8', 8, 'mcq', 'The following text is from Charlotte Brontë''s 1847 novel Jane Eyre. Jane works as a governess at Thornfield Hall.

I went on with my day''s business tranquilly; but ever and anon vague suggestions kept wandering across my brain of reasons why I should quit Thornfield; and I kept involuntarily framing advertisements and pondering conjectures about new situations: these thoughts I did not think to check; they might germinate and bear fruit if they could.', NULL, 'Which choice best states the main purpose of the text?', '{"A":"To convey a contrast between Jane''s outward calmness and internal restlessness.","B":"To emphasize Jane''s loyalty to the people she works for at Thornfield Hall.","C":"To demonstrate that Jane finds her situation both challenging and deeply fulfilling.","D":"To describe Jane''s determination to secure employment outside of Thornfield Hall."}'::jsonb, NULL, 'A', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '2-9', 9, 'mcq', 'Text 1
Most animals can regenerate some parts of their bodies, such as skin. But when a three-banded panther worm is cut into three pieces, each piece grows into a new worm. Researchers are investigating this feat partly to learn more about humans'' comparatively limited abilities to regenerate, and they''re making exciting progress. An especially promising discovery is that both humans and panther worms have a gene for early growth response (EGR) linked to regeneration.

Text 2
When Mansi Srivastava and her team reported that panther worms, like humans, possess a gene for EGR, it caused excitement. However, as the team pointed out, the gene likely functions very differently in humans than it does in panther worms. Srivastava has likened EGR to a switch that activates other genes involved in regeneration in panther worms, but how this switch operates in humans remains unclear.', NULL, 'Based on the texts, what would the author of Text 2 most likely say about Text 1''s characterization of the discovery involving EGR?', '{"A":"It is reasonable given that Srivastava and her team have identified how EGR functions in both humans and panther worms.","B":"It is overly optimistic given additional observations from Srivastava and her team.","C":"It is unexpected given that Srivastava and her team''s findings were generally well received.","D":"It is unfairly dismissive given the progress that Srivastava and her team have reported."}'::jsonb, NULL, 'B', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '2-10', 10, 'mcq', 'The following text is adapted from William Shakespeare''s 1609 poem "Sonnet 27." The poem is addressed to a close friend as if he were physically present.

Weary with toil, I [hurry] to my bed,
The dear repose for limbs with travel tired;
But then begins a journey in my head
To work my mind, when body''s work''s expired:
For then my thoughts—from far where I abide—
[Begin] a zealous pilgrimage to thee,
And keep my drooping eyelids open wide,', NULL, 'What is the main idea of the text?', '{"A":"The speaker is asleep and dreaming about traveling to see the friend.","B":"The speaker is planning an upcoming trip to the friend''s house.","C":"The speaker is too fatigued to continue a discussion with the friend.","D":"The speaker is thinking about the friend instead of immediately falling asleep."}'::jsonb, NULL, 'D', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '2-11', 11, 'mcq', 'The following text is adapted from Lewis Carroll''s 1889 satirical novel Sylvie and Bruno. A crowd has gathered outside a room belonging to the Warden, an official who reports to the Lord Chancellor.

One man, who was more excited than the rest, flung his hat high into the air, and shouted (as well as I could make out) "Who roar for the Sub-Warden?" Everybody roared, but whether it was for the Sub-Warden, or not, did not clearly appear: some were shouting "Bread!" and some "Taxes!", but no one seemed to know what it was they really wanted.

All this I saw from the open window of the Warden''s breakfast-saloon, looking across the shoulder of the Lord Chancellor.

"What can it all mean?" he kept repeating to himself. "I never heard such shouting before—and at this time of the morning, too! And with such unanimity!"', NULL, 'Based on the text, how does the Lord Chancellor respond to the crowd?', '{"A":"He asks about the meaning of the crowd''s shouting, even though he claims to know what the crowd wants.","B":"He indicates a desire to speak to the crowd, even though the crowd has asked to speak to the Sub-Warden.","C":"He expresses sympathy for the crowd''s demands, even though the crowd''s shouting annoys him.","D":"He describes the crowd as being unified, even though the crowd clearly appears otherwise."}'::jsonb, NULL, 'D', NULL, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '2-12', 12, 'mcq', 'O Pioneers! is a 1913 novel by Willa Cather. In the novel, Cather portrays Alexandra Bergson as having a deep emotional connection to her natural surroundings: ______', NULL, 'Which quotation from O Pioneers! most effectively illustrates the claim?', '{"A":"\"She had never known before how much the country meant to her. The chirping of the insects down in the long grass had been like the sweetest music. She had felt as if her heart were hiding down there, somewhere, with the quail and the plover and all the little wild things that crooned or buzzed in the sun. Under the long shaggy ridges, she felt the future stirring.\"","B":"\"Alexandra talked to the men about their crops and to the women about their poultry. She spent a whole day with one young farmer who had been away at school, and who was experimenting with a new kind of clover hay. She learned a great deal.\"","C":"\"Alexandra drove off alone. The rattle of her wagon was lost in the howling of the wind, but her lantern, held firmly between her feet, made a moving point of light along the highway, going deeper and deeper into the dark country.\"","D":"\"It was Alexandra who read the papers and followed the markets, and who learned by the mistakes of their neighbors. It was Alexandra who could always tell about what it had cost to fatten each steer, and who could guess the weight of a hog before it went on the scales closer than John Bergson [her father] himself.\""}'::jsonb, NULL, 'A', NULL, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '2-13', 13, 'mcq', 'Approximate Rates of Speech and Information Conveyed for Five Languages

Language | Rate of speech (syllables per second) | Rate of information conveyed (bits per second)
Serbian | 7.2 | 39.1
Spanish | 7.7 | 42.0
Vietnamese | 5.3 | 42.5
Thai | 4.7 | 33.8
Hungarian | 5.9 | 34.6

A group of researchers working in Europe, Asia, and Oceania conducted a study to determine how quickly different Eurasian languages are typically spoken (in syllables per second) and how much information they can effectively convey (in bits per second). They found that, although languages vary widely in the speed at which they are spoken, the amount of information languages can effectively convey tends to vary much less. Thus, they claim that two languages with very different spoken rates can nonetheless convey the same amount of information in a given amount of time.', NULL, 'Which choice best describes data from the table that support the researchers'' claim?', '{"A":"Among the five languages in the table, Thai and Hungarian have the lowest rates of speech and the lowest rates of information conveyed.","B":"Vietnamese conveys information at approximately the same rate as Spanish despite being spoken at a slower rate.","C":"Among the five languages in the table, the language that is spoken the fastest is also the language that conveys information the fastest.","D":"Serbian and Spanish are spoken at approximately the same rate, but Serbian conveys information faster than Spanish does."}'::jsonb, NULL, 'B', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '2-14', 14, 'mcq', 'Psychologists Dacher Keltner and Jonathan Haidt have argued that experiencing awe—a sensation of reverence and wonder typically brought on by perceiving something grand or powerful—can enable us to feel more connected to others and thereby inspire us to act more altruistically. Keltner, along with Paul K. Piff, Pia Dietze, and colleagues, claims to have found evidence for this effect in a recent study where participants were asked to either gaze up at exceptionally tall trees in a nearby grove (reported to be a universally awe-inspiring experience) or stare at the exterior of a nearby, nondescript building. After one minute, an experimenter deliberately spilled a box of pens nearby.', NULL, 'Which finding from the researchers'' study, if true, would most strongly support their claim?', '{"A":"Participants who had been looking at the trees helped the experimenter pick up significantly more pens than did participants who had been looking at the building.","B":"Participants who helped the experimenter pick up the pens used a greater number of positive words to describe the trees and the building in a postexperiment survey than did participants who did not help the experimenter.","C":"Participants who did not help the experimenter pick up the pens were significantly more likely to report having experienced a feeling of awe, regardless of whether they looked at the building or the trees.","D":"Participants who had been looking at the building were significantly more likely to notice that the experimenter had dropped the pens than were participants who had been looking at the trees."}'::jsonb, NULL, 'A', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '2-15', 15, 'mcq', 'Employment by Sector in France and the United States, 1800–2012 (% of total employment)

Year | Agriculture in France | Manufacturing in France | Services in France | Agriculture in US | Manufacturing in US | Services in US
1800 | 64 | 22 | 14 | 68 | 18 | 13
1900 | 43 | 29 | 28 | 41 | 28 | 31
1950 | 32 | 33 | 35 | 14 | 33 | 53
2012 | 3 | 21 | 76 | 2 | 18 | 80
Rows in table may not add up to 100 due to rounding.

Over the past two hundred years, the percentage of the population employed in the agricultural sector has declined in both France and the United States, while employment in the service sector (which includes jobs in retail, consulting, real estate, etc.) has risen. However, this transition happened at very different rates in the two countries. This can be seen most clearly by comparing the employment by sector in both countries in ______', NULL, 'Which choice most effectively uses data from the table to complete the statement?', '{"A":"1900 with the employment by sector in 1950.","B":"1800 with the employment by sector in 2012.","C":"1900 with the employment by sector in 2012.","D":"1800 with the employment by sector in 1900."}'::jsonb, NULL, 'A', NULL, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '2-16', 16, 'mcq', 'Many archaeologists will tell you that categorizing excavated fragments of pottery by style, period, and what objects they belong to relies not only on standard criteria, but also on instinct developed over years of practice. In a recent study, however, researchers trained a deep-learning computer model on thousands of images of pottery fragments and found that it could categorize them as accurately as a team of expert archaeologists. Some archaeologists have expressed concern that they might be replaced by such computer models, but the researchers claim that outcome is highly unlikely.', NULL, 'Which finding, if true, would most directly support the researchers'' claim?', '{"A":"In the researchers'' study, the model was able to categorize the pottery fragments much more quickly than the archaeologists could.","B":"In the researchers'' study, neither the model nor the archaeologists were able to accurately categorize all the pottery fragments that were presented.","C":"A survey of archaeologists showed that categorizing pottery fragments limits the amount of time they can dedicate to other important tasks that only human experts can do.","D":"A survey of archaeologists showed that few of them received dedicated training in how to properly categorize pottery fragments."}'::jsonb, NULL, 'C', NULL, NULL, 23)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '2-17', 17, 'mcq', 'Although military veterans make up a small proportion of the total population of the United States, they occupy a significantly higher proportion of the jobs in the civilian government. One possible explanation for this disproportionate representation is that military service familiarizes people with certain organizational structures that are also reflected in the civilian government bureaucracy, and this familiarity thus ______', NULL, 'Which choice most logically completes the text?', '{"A":"makes civilian government jobs especially appealing to military veterans.","B":"alters the typical relationship between military service and subsequent career preferences.","C":"encourages nonveterans applying for civilian government jobs to consider military service instead.","D":"increases the number of civilian government jobs that require some amount of military experience to perform."}'::jsonb, NULL, 'A', NULL, NULL, 23)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '2-18', 18, 'mcq', 'Birds of many species ingest foods containing carotenoids, pigmented molecules that are converted into feather coloration. Coloration tends to be especially saturated in male birds'' feathers, and because carotenoids also confer health benefits, the deeply saturated colors generally serve to communicate what is known as an honest signal of a bird''s overall fitness to potential mates. However, ornithologist Allison J. Shultz and others have found that males in several species of the tanager genus Ramphocelus use microstructures in their feathers to manipulate light, creating the appearance of deeper saturation without the birds necessarily having to maintain a carotenoid-rich diet. These findings suggest that ______', NULL, 'Which choice most logically completes the text?', '{"A":"individual male tanagers can engage in honest signaling without relying on carotenoid consumption.","B":"feather microstructures may be less effective than deeply saturated feathers for signaling overall fitness.","C":"scientists have yet to determine why tanagers have a preference for mates with colorful feathers.","D":"a male tanager''s appearance may function as a dishonest signal of the individual''s overall fitness."}'::jsonb, NULL, 'D', NULL, NULL, 24)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '2-19', 19, 'mcq', NULL, NULL, 'When writing The Other Black Girl (2021), novelist Zakiya Dalila Harris drew on her own experiences working at a publishing office. The award-winning book is Harris''s first novel, but her writing experience ______ honored before. At the age of twelve, she entered a contest to have a story published in American Girl magazine—and won.

Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"were","B":"have been","C":"has been","D":"are"}'::jsonb, NULL, 'C', NULL, NULL, 24)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '2-20', 20, 'mcq', NULL, NULL, 'The Alvarez theory, developed in 1980 by physicist Luis Walter Alvarez and his geologist son Walter Alvarez, maintained that the secondary effects of an asteroid impact caused many dinosaurs and other animals to die ______: it left unexplored the question of whether unrelated volcanic activity might have also contributed to the mass extinctions.

Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"out but","B":"out, but","C":"out","D":"out,"}'::jsonb, NULL, 'B', NULL, NULL, 24)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '2-21', 21, 'mcq', NULL, NULL, 'In winter, the diets of Japanese macaques, also known as snow monkeys, are influenced more by food availability than by food preference. Although the monkeys prefer to eat vegetation and land-dwelling invertebrates, those food sources may become unavailable because of extensive snow and ice cover, ______ the monkeys to hunt for marine animals in any streams that have not frozen over.

Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"forces","B":"to force","C":"forcing","D":"forced"}'::jsonb, NULL, 'C', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '2-22', 22, 'mcq', NULL, NULL, 'Lucia Michof of the University of Chile observed that alkaline soils contain an insoluble form of iron that blueberry plants cannot absorb, thus inhibiting blueberry growth. If these plants were grown in alkaline soil alongside grasses that aid in iron solubilization, ______ Michof was determined to find out.

Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"could the blueberries thrive.","B":"the blueberries could thrive.","C":"the blueberries could thrive?","D":"could the blueberries thrive?"}'::jsonb, NULL, 'D', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '2-23', 23, 'mcq', NULL, NULL, 'In his 1963 exhibition Exposition of Music—Electronic Television, Korean American artist Nam June Paik showed how television images could be manipulated to express an artist''s perspective. Today, Paik ______ considered the first video artist.

Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"will be","B":"had been","C":"was","D":"is"}'::jsonb, NULL, 'D', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '2-24', 24, 'mcq', NULL, NULL, 'The first computerized spreadsheet, Dan Bricklin''s VisiCalc, improved financial recordkeeping not only by providing users with an easy means of adjusting data in spreadsheets but also by automatically updating all calculations that were dependent on these ______ to VisiCalc''s release, changing a paper spreadsheet often required redoing the entire sheet by hand, a process that could take days.

Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"adjustments prior","B":"adjustments, prior","C":"adjustments. Prior","D":"adjustments and prior"}'::jsonb, NULL, 'C', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '2-25', 25, 'mcq', NULL, NULL, 'In order to prevent nonnative fish species from moving freely between the Mediterranean and Red Seas, marine biologist Bella Galil has proposed that a saline lock system be installed along the Suez Canal in Egypt''s Great Bitter Lakes. The lock would increase the salinity of the lakes and ______ a natural barrier of water most marine creatures would be unable to cross.

Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"creates","B":"create","C":"creating","D":"created"}'::jsonb, NULL, 'B', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '2-26', 26, 'mcq', NULL, NULL, 'Despite being cheap, versatile, and easy to produce, ______ they are made from nonrenewable petroleum, and most do not biodegrade in landfills.

Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"there are two problems associated with commercial plastics.","B":"two problems are associated with commercial plastics.","C":"commercial plastics'' two associated problems are that","D":"commercial plastics have two associated problems"}'::jsonb, NULL, 'D', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '2-27', 27, 'mcq', NULL, NULL, 'Stomata, tiny pore structures in a leaf that absorb gases needed for plant growth, open when guard cells surrounding each pore swell with water. In a pivotal 2007 article, plant cell ______ showed that lipid molecules called phosphatidylinositol phosphates are responsible for signaling guard cells to open stomata.

Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"biologist, Yuree Lee","B":"biologist Yuree Lee,","C":"biologist Yuree Lee","D":"biologist, Yuree Lee,"}'::jsonb, NULL, 'C', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 28, '2-28', 28, 'mcq', NULL, NULL, 'Small, flat structures called spatulae are found at the tips of the hairs on a spider''s leg. These spatulae temporarily bond with the atoms of whatever they touch. ______ spiders are able to cling to and climb almost any surface.

Which choice completes the text with the most logical transition?', '{"A":"For instance,","B":"However,","C":"Similarly,","D":"As a result,"}'::jsonb, NULL, 'D', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 29, '2-29', 29, 'mcq', NULL, NULL, 'In November 1934, Amrita Sher-Gil was living in what must have seemed like the ideal city for a young artist: Paris. She was studying firsthand the color-saturated style of France''s modernist masters and beginning to make a name for herself as a painter. ______ Sher-Gil longed to return to her childhood home of India; only there, she believed, could her art truly flourish.

Which choice completes the text with the most logical transition?', '{"A":"Still,","B":"Therefore,","C":"Indeed,","D":"Furthermore,"}'::jsonb, NULL, 'A', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 30, '2-30', 30, 'mcq', NULL, NULL, 'Before California''s 1911 election to approve a proposition granting women the right to vote, activists across the state sold tea to promote the cause of suffrage. In San Francisco, the Woman''s Suffrage Party sold Equality Tea at local fairs. ______ in Los Angeles, activist Nancy Tuttle Craig, who ran one of California''s largest grocery store firms, distributed Votes for Women Tea.

Which choice completes the text with the most logical transition?', '{"A":"For example,","B":"To conclude,","C":"Similarly,","D":"In other words,"}'::jsonb, NULL, 'C', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 31, '2-31', 31, 'mcq', 'While researching a topic, a student has taken the following notes:
• The Seikan Tunnel is a rail tunnel in Japan.
• It connects the island of Honshu to the island of Hokkaido.
• It is roughly 33 miles long.
• The Channel Tunnel is a rail tunnel in Europe.
• It connects Folkestone, England, to Coquelles, France.
• It is about 31 miles long.

The student wants to compare the lengths of the two rail tunnels. Which choice most effectively uses relevant information from the notes to accomplish this goal?', NULL, 'The student wants to compare the lengths of the two rail tunnels. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Some of the world''s rail tunnels, including one tunnel that extends from Folkestone, England, to Coquelles, France, are longer than 30 miles.","B":"The Seikan Tunnel is roughly 33 miles long, while the slightly shorter Channel Tunnel is about 31 miles long.","C":"The Seikan Tunnel, which is roughly 33 miles long, connects the Japanese islands of Honshu and Hokkaido.","D":"Both the Seikan Tunnel, which is located in Japan, and the Channel Tunnel, which is located in Europe, are examples of rail tunnels."}'::jsonb, NULL, 'B', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 32, '2-32', 32, 'mcq', 'While researching a topic, a student has taken the following notes:
• Jon Ching is a Los Angeles-based painter.
• He uses the term "flauna" to describe the plant-animal hybrids that he depicts in his surreal paintings.
• "Flauna" is a combination of the words "flora" and "fauna."
• His painting Nectar depicts a parrot with leaves for feathers.
• His painting Primaveral depicts a snow leopard whose fur sprouts flowers.

The student wants to provide an explanation and example of "flauna." Which choice most effectively uses relevant information from the notes to accomplish this goal?', NULL, 'The student wants to provide an explanation and example of "flauna." Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"The term \"flauna,\" used by Los Angeles-based painter Jon Ching, is a combination of the words \"flora\" and \"fauna.\"","B":"Jon Ching uses the term \"flauna,\" a combination of the words \"flora\" and \"fauna,\" to describe the subjects of his surreal paintings: plant-animal hybrids such as a parrot with leaves for feathers.","C":"Jon Ching, who created Nectar, refers to the subjects of his paintings as \"flauna.\"","D":"The subjects of Nectar and Primaveral are types of \"flauna,\" a term that the paintings'' creator, Jon Ching, uses when describing his surreal artworks."}'::jsonb, NULL, 'B', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 33, '2-33', 33, 'mcq', 'While researching a topic, a student has taken the following notes:
• In the midst of the US Civil War, Susie Taylor escaped slavery and fled to Union-army-occupied St. Simons Island off the Georgia coast.
• She began working for an all-Black army regiment as a nurse and teacher.
• In 1902, she published a book about the time she spent with the regiment.
• Her book was the only Civil War memoir to be published by a Black woman.
• It is still available to readers in print and online.

The student wants to emphasize the uniqueness of Taylor''s accomplishment. Which choice most effectively uses relevant information from the notes to accomplish this goal?', NULL, 'The student wants to emphasize the uniqueness of Taylor''s accomplishment. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Taylor fled to St. Simons Island, which was then occupied by the Union army, for whom she began working.","B":"After escaping slavery, Taylor began working for an all-Black army regiment as a nurse and teacher.","C":"The book Taylor wrote about the time she spent with the regiment is still available to readers in print and online.","D":"Taylor was the only Black woman to publish a Civil War memoir."}'::jsonb, NULL, 'D', NULL, NULL, 28)
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
  VALUES (v_mod, 1, '3-1', 1, 'mcq', NULL, NULL, 'What is 10% of 470?', '{"A":"37","B":"47","C":"423","D":"460"}'::jsonb, NULL, 'B', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '3-2', 2, 'mcq', '$4x + 6 = 18$', NULL, 'Which equation has the same solution as the given equation?', '{"A":"$4x = 108$","B":"$4x = 24$","C":"$4x = 12$","D":"$4x = 3$"}'::jsonb, NULL, 'C', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '3-3', 3, 'mcq', NULL, NULL, 'The total cost, in dollars, to rent a surfboard consists of a $25 service fee and a $10 per hour rental fee. A person rents a surfboard for $t$ hours and intends to spend a maximum of $75 to rent the surfboard. Which inequality represents this situation?', '{"A":"$10t \\le 75$","B":"$10 + 25t \\le 75$","C":"$25t \\le 75$","D":"$25 + 10t \\le 75$"}'::jsonb, NULL, 'D', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '3-4', 4, 'mcq', NULL, NULL, 'The function $g$ is defined by $g(x) = x^2 + 9$. For which value of $x$ is $g(x) = 25$?', '{"A":"4","B":"5","C":"9","D":"13"}'::jsonb, NULL, 'A', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '3-5', 5, 'mcq', NULL, NULL, 'Each face of a fair 14-sided die is labeled with a number from 1 through 14, with a different number appearing on each face. If the die is rolled one time, what is the probability of rolling a 2?', '{"A":"$\\frac{1}{14}$","B":"$\\frac{2}{14}$","C":"$\\frac{12}{14}$","D":"$\\frac{13}{14}$"}'::jsonb, NULL, 'A', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '3-6', 6, 'grid', NULL, NULL, 'A printer produces posters at a constant rate of 42 posters per minute. At what rate, in posters per hour, does the printer produce the posters?', NULL, NULL, '2520', '["2520"]'::jsonb, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '3-7', 7, 'grid', NULL, NULL, 'The function $f$ is defined by the equation $f(x) = 7x + 2$. What is the value of $f(x)$ when $x = 4$?', NULL, NULL, '30', '["30"]'::jsonb, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '3-8', 8, 'mcq', NULL, NULL, 'A teacher is creating an assignment worth 70 points. The assignment will consist of questions worth 1 point and questions worth 3 points. Which equation represents this situation, where $x$ represents the number of 1-point questions and $y$ represents the number of 3-point questions?', '{"A":"$4xy = 70$","B":"$4(x + y) = 70$","C":"$3x + y = 70$","D":"$x + 3y = 70$"}'::jsonb, NULL, 'D', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '3-9', 9, 'mcq', NULL, NULL, 'Right triangles $LMN$ and $PQR$ are similar, where $L$ and $M$ correspond to $P$ and $Q$, respectively. Angle $M$ has a measure of $53\degree$. What is the measure of angle $Q$?', '{"A":"$37\\degree$","B":"$53\\degree$","C":"$127\\degree$","D":"$143\\degree$"}'::jsonb, NULL, 'B', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '3-10', 10, 'mcq', '$y = -3x$
$4x + y = 15$', NULL, 'The solution to the given system of equations is $(x, y)$. What is the value of $x$?', '{"A":"1","B":"5","C":"15","D":"45"}'::jsonb, NULL, 'C', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '3-11', 11, 'mcq', '(Figure: Scatterplot in the first quadrant. The x-axis runs from 0 to 8 (gridlines at 1,2,3,4,5,6,7,8) and the y-axis runs from 0 to 10 (gridlines at 1 through 10). Plotted data points form a positive linear trend rising from lower-left to upper-right: points are located approximately at (1,0), (1.5,1), (2,2), (2.5,3), (3,4), (3.5,4), (4,6), (4.5,7), (5,7), (5.5,8), (6,9), (6.5,10). The points trend upward with positive slope.)', 'Scatterplot in the first quadrant. The x-axis runs from 0 to 8 (gridlines at 1,2,3,4,5,6,7,8) and the y-axis runs from 0 to 10 (gridlines at 1 through 10). Plotted data points form a positive linear trend rising from lower-left to upper-right: points are located approximately at (1,0), (1.5,1), (2,2), (2.5,3), (3,4), (3.5,4), (4,6), (4.5,7), (5,7), (5.5,8), (6,9), (6.5,10). The points trend upward with positive slope.', 'Which of the following equations is the most appropriate linear model for the data shown in the scatterplot?', '{"A":"$y = -1.9x - 10.1$","B":"$y = -1.9x + 10.1$","C":"$y = 1.9x - 10.1$","D":"$y = 1.9x + 10.1$"}'::jsonb, NULL, 'B', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '3-12', 12, 'mcq', '(Figure: Graph of a cubic curve y = f(x) on an xy-plane. The x-axis is labeled from about -8 to 8 and the y-axis from about -16 to 16 (gridlines every 2 units). The curve comes down steeply from the upper-left, crosses the x-axis once on the negative side (near x = -3), continues down to a local minimum, rises to cross the x-axis (near x = -1), reaches a local maximum, falls again to cross the x-axis a third time (near x = 2), then rises steeply to the upper-right. The curve intersects the x-axis at three distinct points.)', 'Graph of a cubic curve y = f(x) on an xy-plane. The x-axis is labeled from about -8 to 8 and the y-axis from about -16 to 16 (gridlines every 2 units). The curve comes down steeply from the upper-left, crosses the x-axis once on the negative side (near x = -3), continues down to a local minimum, rises to cross the x-axis (near x = -1), reaches a local maximum, falls again to cross the x-axis a third time (near x = 2), then rises steeply to the upper-right. The curve intersects the x-axis at three distinct points.', 'The graph of $y = f(x)$ is shown, where the function $f$ is defined by $f(x) = ax^3 + bx^2 + cx + d$ and $a$, $b$, $c$, and $d$ are constants. For how many values of $x$ does $f(x) = 0$?', '{"A":"One","B":"Two","C":"Three","D":"Four"}'::jsonb, NULL, 'C', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '3-13', 13, 'grid', NULL, NULL, 'Vivian bought party hats and cupcakes for $71. Each of party hats cost $3, and each cupcake cost $1. If Vivian bought 10 packages of party hats, how many cupcakes did she buy?', NULL, NULL, '41', '["41"]'::jsonb, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '3-14', 14, 'grid', '$x^2 + 10x - 24 = 0$', NULL, 'What is one of the solutions to the given equation?', NULL, NULL, '2', '["2","-12"]'::jsonb, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '3-15', 15, 'mcq', NULL, NULL, 'Bacteria are growing in a liquid growth medium. There were 300,000 cells per milliliter during an initial observation. The number of cells per milliliter doubles every 3 hours. How many cells per milliliter will there be 15 hours after the initial observation?', '{"A":"1,500,000","B":"2,400,000","C":"4,500,000","D":"9,600,000"}'::jsonb, NULL, 'D', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '3-16', 16, 'mcq', NULL, NULL, 'Which expression is equivalent to $4x^8y^3 + 12x^5y^2$?', '{"A":"$4x^3y^2(2x^5)$","B":"$4x^5y^2(y)$","C":"$4x^5y^2(x^4 + 2)$","D":"$4x^5y^2(x^4y + 2)$"}'::jsonb, NULL, 'C', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '3-17', 17, 'mcq', NULL, NULL, 'A neighborhood consists of a 2-hectare park and a 35-hectare residential area. The total number of trees in the neighborhood is 3,934. The equation $2x + 35y = 3{,}934$ represents this situation. Which of the following is the best interpretation of $x$ in this context?', '{"A":"The average number of trees per hectare in the park","B":"The average number of trees per hectare in the residential area","C":"The total number of trees in the park","D":"The total number of trees in the residential area"}'::jsonb, NULL, 'A', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '3-18', 18, 'mcq', '(Figure: Line graph in the first quadrant. The horizontal axis is labeled ''Company A'' and runs from 0 to 100 (gridlines at 10,20,30,40,50,60,70,80,90,100). The vertical axis is labeled ''Company B'' and runs from 0 to 50 (gridlines at 10,20,30,40,50). A straight line segment with negative slope is drawn, beginning at the y-intercept (0, 40) and decreasing to the x-intercept (60, 0).)', 'Line graph in the first quadrant. The horizontal axis is labeled ''Company A'' and runs from 0 to 100 (gridlines at 10,20,30,40,50,60,70,80,90,100). The vertical axis is labeled ''Company B'' and runs from 0 to 50 (gridlines at 10,20,30,40,50). A straight line segment with negative slope is drawn, beginning at the y-intercept (0, 40) and decreasing to the x-intercept (60, 0).', 'The graph shows the relationship between the number of shares of stock from Company A, $x$, and the number of shares of stock from Company B, $y$, that Simone can purchase. Which equation could represent this relationship?', '{"A":"$y = 8x + 12$","B":"$8x + 12y = 480$","C":"$y = 12x + 8$","D":"$12x + 8y = 480$"}'::jsonb, NULL, 'B', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '3-19', 19, 'mcq', NULL, NULL, 'Circle A has a radius of $3n$ and circle B has a radius of $129n$, where $n$ is a positive constant. The area of circle B is how many times the area of circle A?', '{"A":"43","B":"86","C":"129","D":"1,849"}'::jsonb, NULL, 'D', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '3-20', 20, 'grid', 'Frequency table:
Data value | Frequency
6 | 3
7 | 3
8 | 8
9 | 8
10 | 9
11 | 11
12 | 9
13 | 0
14 | 6', NULL, 'The frequency table summarizes the 57 data values in a data set. What is the maximum data value in the data set?', NULL, NULL, '14', '["14"]'::jsonb, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '3-21', 21, 'grid', NULL, NULL, 'A circle in the $xy$-plane has a diameter with endpoints $(2, 4)$ and $(2, 14)$. An equation of this circle is $(x - 2)^2 + (y - 9)^2 = r^2$, where $r$ is a positive constant. What is the value of $r$?', NULL, NULL, '5', '["5"]'::jsonb, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '3-22', 22, 'mcq', NULL, NULL, 'The measure of angle $R$ is $\frac{2\pi}{3}$ radians. The measure of angle $T$ is $\frac{5\pi}{12}$ radians greater than the measure of angle $R$. What is the measure of angle $T$, in degrees?', '{"A":"75","B":"120","C":"195","D":"390"}'::jsonb, NULL, 'C', NULL, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '3-23', 23, 'mcq', NULL, NULL, 'A certain town has an area of 4.36 square miles. What is the area, in square yards, of this town? (1 mile = 1,760 yards)', '{"A":"404","B":"7,674","C":"710,459","D":"13,505,536"}'::jsonb, NULL, 'D', NULL, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '3-24', 24, 'mcq', 'Table for line h:
x | y
18 | 130
23 | 160
26 | 178', NULL, 'For line $h$, the table shows three values of $x$ and their corresponding values of $y$. Line $k$ is the result of translating line $h$ down 5 units in the $xy$-plane. What is the $x$-intercept of line $k$?', '{"A":"$\\left(-\\frac{26}{3}, 0\\right)$","B":"$\\left(-\\frac{9}{2}, 0\\right)$","C":"$\\left(-\\frac{11}{3}, 0\\right)$","D":"$\\left(-\\frac{17}{6}, 0\\right)$"}'::jsonb, NULL, 'D', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '3-25', 25, 'mcq', NULL, NULL, 'In the $xy$-plane, the graph of the equation $y = -x^2 + 9x - 100$ intersects the line $y = c$ at exactly one point. What is the value of $c$?', '{"A":"$-\\frac{481}{4}$","B":"$-100$","C":"$-\\frac{319}{4}$","D":"$-\\frac{9}{2}$"}'::jsonb, NULL, 'C', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '3-26', 26, 'mcq', '$2x + 3y = 7$
$10x + 15y = 35$', NULL, 'For each real number $r$, which of the following points lies on the graph of each equation in the $xy$-plane for the given system?', '{"A":"$\\left(\\frac{r}{5} + 7, -\\frac{r}{5} + 35\\right)$","B":"$\\left(-\\frac{3r}{2} + \\frac{7}{2}, r\\right)$","C":"$\\left(r, \\frac{2r}{3} + \\frac{7}{3}\\right)$","D":"$\\left(r, -\\frac{3r}{2} + \\frac{7}{2}\\right)$"}'::jsonb, NULL, 'B', NULL, NULL, 40)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '3-27', 27, 'grid', NULL, NULL, 'The perimeter of an equilateral triangle is 624 centimeters. The height of this triangle is $k\sqrt{3}$ centimeters, where $k$ is a constant. What is the value of $k$?', NULL, NULL, '104', '["104"]'::jsonb, NULL, 40)
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
  VALUES (v_mod, 1, '4-1', 1, 'mcq', NULL, NULL, 'Tilly earns $p$ dollars for every $w$ hours of work. Which expression represents the amount of money, in dollars, Tilly earns for $39w$ hours of work?', '{"A":"$39p$","B":"$\\dfrac{p}{39}$","C":"$p + 39$","D":"$p - 39$"}'::jsonb, NULL, 'A', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '4-2', 2, 'mcq', NULL, NULL, 'For a training program, Juan rides his bike at an average rate of 5.7 minutes per mile. Which function $m$ models the number of minutes it will take Juan to ride $x$ miles at this rate?', '{"A":"$m(x) = \\dfrac{x}{5.7}$","B":"$m(x) = x + 5.7$","C":"$m(x) = x - 5.7$","D":"$m(x) = 5.7x$"}'::jsonb, NULL, 'D', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '4-3', 3, 'mcq', '$3x = 12$
$-3x + y = -6$', NULL, 'The solution to the given system of equations is $(x, y)$. What is the value of $y$?', '{"A":"$-3$","B":"$6$","C":"$18$","D":"$30$"}'::jsonb, NULL, 'B', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '4-4', 4, 'mcq', '$s = 40 + 3t$', NULL, 'The equation gives the speed $s$, in miles per hour, of a certain car $t$ seconds after it began to accelerate. What is the speed, in miles per hour, of the car 5 seconds after it began to accelerate?', '{"A":"$40$","B":"$43$","C":"$45$","D":"$55$"}'::jsonb, NULL, 'D', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '4-5', 5, 'mcq', '(Figure: A right triangle with the right angle at the bottom-left vertex. The vertical left leg is labeled $a$, the horizontal bottom leg is labeled $b$, and the hypotenuse (from the top vertex down to the bottom-right vertex) is labeled $c$. Note: Figure not drawn to scale.)', 'A right triangle with the right angle at the bottom-left vertex. The vertical left leg is labeled $a$, the horizontal bottom leg is labeled $b$, and the hypotenuse (from the top vertex down to the bottom-right vertex) is labeled $c$. Note: Figure not drawn to scale.', 'For the right triangle shown, $a = 4$ and $b = 5$. Which expression represents the value of $c$?', '{"A":"$4 + 5$","B":"$\\sqrt{(4)(5)}$","C":"$\\sqrt{4 + 5}$","D":"$\\sqrt{4^2 + 5^2}$"}'::jsonb, NULL, 'D', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '4-6', 6, 'grid', '$4x + 5 = 165$', NULL, 'What is the solution to the given equation?', NULL, NULL, '40', '["40"]'::jsonb, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '4-7', 7, 'grid', '(Figure: An xy-plane with the x-axis labeled from 0 to 12 (gridlines at 2, 4, 6, 8, 10, 12) and the y-axis labeled with values -2, 2, 4, 6, 8, 10. A U-shaped upward-opening parabola is drawn. Its vertex sits on the x-axis at approximately x = 7, y = 0 (the single x-intercept). The curve passes through approximately (6, 3) and (8, 3) and rises steeply to y = 10 near x = 5 and x = 9.)', 'An xy-plane with the x-axis labeled from 0 to 12 (gridlines at 2, 4, 6, 8, 10, 12) and the y-axis labeled with values -2, 2, 4, 6, 8, 10. A U-shaped upward-opening parabola is drawn. Its vertex sits on the x-axis at approximately x = 7, y = 0 (the single x-intercept). The curve passes through approximately (6, 3) and (8, 3) and rises steeply to y = 10 near x = 5 and x = 9.', 'The $x$-intercept of the graph shown is $(x, 0)$. What is the value of $x$?', NULL, NULL, '7', '["7"]'::jsonb, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '4-8', 8, 'mcq', NULL, NULL, 'The function $f$ is defined by $f(x) = \dfrac{1}{10}x - 2$. What is the $y$-intercept of the graph of $y = f(x)$ in the $xy$-plane?', '{"A":"$(-2, 0)$","B":"$(0, -2)$","C":"$\\left(0, \\dfrac{1}{10}\\right)$","D":"$\\left(\\dfrac{1}{10}, 0\\right)$"}'::jsonb, NULL, 'B', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '4-9', 9, 'mcq', NULL, NULL, 'The function $f$ is defined by $f(x) = 7x^3$. In the $xy$-plane, the graph of $y = g(x)$ is the result of shifting the graph of $y = f(x)$ down 2 units. Which equation defines function $g$?', '{"A":"$g(x) = \\dfrac{7}{2}x^3$","B":"$g(x) = 7x^{\\frac{3}{2}}$","C":"$g(x) = 7x^3 + 2$","D":"$g(x) = 7x^3 - 2$"}'::jsonb, NULL, 'D', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '4-10', 10, 'mcq', '$x + 7 = 10$
$(x + 7)^2 = y$', NULL, 'Which ordered pair $(x, y)$ is a solution to the given system of equations?', '{"A":"$(3, 100)$","B":"$(3, 3)$","C":"$(3, 10)$","D":"$(3, 70)$"}'::jsonb, NULL, 'A', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '4-11', 11, 'mcq', NULL, NULL, 'Which expression is equivalent to $(7x^3 + 7x) - (6x^3 - 3x)$?', '{"A":"$x^3 + 10x$","B":"$-13x^3 + 10x$","C":"$-13x^3 + 4x$","D":"$x^3 + 4x$"}'::jsonb, NULL, 'A', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '4-12', 12, 'mcq', NULL, NULL, 'The function $p$ is defined by $p(n) = 7n^3$. What is the value of $n$ when $p(n)$ is equal to 56?', '{"A":"$2$","B":"$\\dfrac{8}{3}$","C":"$7$","D":"$8$"}'::jsonb, NULL, 'A', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '4-13', 13, 'grid', '(Figure: Two parallel horizontal lines, the upper labeled $s$ and the lower labeled $t$, are crossed by a transversal line $c$ that slants from lower-left to upper-right. At the intersection of line $c$ with line $s$, the angle is labeled $x^\circ$. At the intersection of line $c$ with line $t$, an angle of $110^\circ$ is marked (interior, on the left/lower side). Note: Figure not drawn to scale.)', 'Two parallel horizontal lines, the upper labeled $s$ and the lower labeled $t$, are crossed by a transversal line $c$ that slants from lower-left to upper-right. At the intersection of line $c$ with line $s$, the angle is labeled $x^\circ$. At the intersection of line $c$ with line $t$, an angle of $110^\circ$ is marked (interior, on the left/lower side). Note: Figure not drawn to scale.', 'In the figure shown, line $c$ intersects parallel lines $s$ and $t$. What is the value of $x$?', NULL, NULL, '70', '["70"]'::jsonb, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '4-14', 14, 'grid', 'A list of 10 data values is shown.
6, 8, 16, 4, 17, 26, 8, 5, 5, 5', NULL, 'What is the mean of these data?', NULL, NULL, '10', '["10"]'::jsonb, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '4-15', 15, 'mcq', NULL, NULL, 'The equation $E(t) = 5(1.8)^t$ gives the estimated number of employees at a restaurant, where $t$ is the number of years since the restaurant opened. Which of the following is the best interpretation of the number 5 in this context?', '{"A":"The estimated number of employees when the restaurant opened","B":"The increase in the estimated number of employees each year","C":"The number of years the restaurant has been open","D":"The percent increase in the estimated number of employees each year"}'::jsonb, NULL, 'A', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '4-16', 16, 'mcq', '$g(x) = x^2 + 55$', NULL, 'What is the minimum value of the given function?', '{"A":"$0$","B":"$55$","C":"$110$","D":"$3{,}025$"}'::jsonb, NULL, 'B', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '4-17', 17, 'mcq', NULL, NULL, 'Each year, the value of an investment increases by 0.49% of its value the previous year. Which of the following functions best models how the value of the investment changes over time?', '{"A":"Decreasing exponential","B":"Decreasing linear","C":"Increasing exponential","D":"Increasing linear"}'::jsonb, NULL, 'C', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '4-18', 18, 'mcq', NULL, NULL, 'The population of Greenville increased by 7% from 2015 to 2016. If the 2016 population is $k$ times the 2015 population, what is the value of $k$?', '{"A":"$0.07$","B":"$0.7$","C":"$1.07$","D":"$1.7$"}'::jsonb, NULL, 'C', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '4-19', 19, 'mcq', NULL, NULL, 'Which expression is equivalent to $a^{\frac{11}{12}}$, where $a > 0$?', '{"A":"$\\sqrt[12]{a^{132}}$","B":"$\\sqrt[144]{a^{132}}$","C":"$\\sqrt[121]{a^{132}}$","D":"$\\sqrt[11]{a^{132}}$"}'::jsonb, NULL, 'B', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '4-20', 20, 'grid', NULL, NULL, 'An event planner is planning a party. It costs the event planner a onetime fee of $\$35$ to rent the venue and $\$10.25$ per attendee. The event planner has a budget of $\$200$. What is the greatest number of attendees possible without exceeding the budget?', NULL, NULL, '16', '["16"]'::jsonb, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '4-21', 21, 'grid', NULL, NULL, 'If $|4x - 4| = 112$, what is the positive value of $x - 1$?', NULL, NULL, '28', '["28"]'::jsonb, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '4-22', 22, 'mcq', NULL, NULL, 'A cube has an edge length of 68 inches. A solid sphere with a radius of 34 inches is inside the cube, such that the sphere touches the center of each face of the cube. To the nearest cubic inch, what is the volume of the space in the cube not taken up by the sphere?', '{"A":"$149{,}796$","B":"$164{,}500$","C":"$190{,}955$","D":"$310{,}800$"}'::jsonb, NULL, 'A', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '4-23', 23, 'mcq', NULL, NULL, 'What is the diameter of the circle in the $xy$-plane with equation $(x - 5)^2 + (y - 3)^2 = 16$?', '{"A":"$4$","B":"$8$","C":"$16$","D":"$32$"}'::jsonb, NULL, 'B', NULL, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '4-24', 24, 'mcq', NULL, NULL, 'For the exponential function $f$, the value of $f(1)$ is $k$, where $k$ is a constant. Which of the following equivalent forms of the function $f$ shows the value of $k$ as the coefficient or the base?', '{"A":"$f(x) = 50(1.6)^{x+1}$","B":"$f(x) = 80(1.6)^x$","C":"$f(x) = 128(1.6)^{x-1}$","D":"$f(x) = 204.8(1.6)^{x-2}$"}'::jsonb, NULL, 'C', NULL, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '4-25', 25, 'mcq', NULL, NULL, 'A model estimates that at the end of each year from 2015 to 2020, the number of squirrels in a population was 150% more than the number of squirrels in the population at the end of the previous year. The model estimates that at the end of 2016, there were 180 squirrels in the population. Which of the following equations represents this model, where $n$ is the estimated number of squirrels in the population $t$ years after the end of 2015 and $t \le 5$?', '{"A":"$n = 72(1.5)^t$","B":"$n = 72(2.5)^t$","C":"$n = 180(1.5)^t$","D":"$n = 180(2.5)^t$"}'::jsonb, NULL, 'B', NULL, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '4-26', 26, 'mcq', '$5x + 7y = 1$
$ax + by = 1$', NULL, 'In the given pair of equations, $a$ and $b$ are constants. The graph of this pair of equations in the $xy$-plane is a pair of perpendicular lines. Which of the following pairs of equations also represents a pair of perpendicular lines?', '{"A":"$10x + 7y = 1$ and $ax - 2by = 1$","B":"$10x + 7y = 1$ and $ax + 2by = 1$","C":"$10x + 7y = 1$ and $2ax + by = 1$","D":"$5x - 7y = 1$ and $ax + by = 1$"}'::jsonb, NULL, 'B', NULL, NULL, 50)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '4-27', 27, 'grid', '$x^2 - 34x + c = 0$', NULL, 'In the given equation, $c$ is a constant. The equation has no real solutions if $c > n$. What is the least possible value of $n$?', NULL, NULL, '289', '["289"]'::jsonb, NULL, 50)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
END $seed$;
