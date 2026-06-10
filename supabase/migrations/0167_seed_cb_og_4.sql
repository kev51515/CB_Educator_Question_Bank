-- =============================================================================
-- Migration: 0167_seed_cb_og_4.sql
-- Purpose:   Seed "CB OG #4" (College Board linear Digital SAT practice test,
--            66 RW + 54 Math = 120 Q) into the full-test tables from 0048.
--   Source:  sat-practice-test-4-digital.pdf; official College Board answer key (pdf/Key/).
--   Idempotent upsert on (slug)/(test_id,position)/(module_id,position).
-- =============================================================================
DO $seed$
DECLARE v_test uuid; v_mod uuid;
BEGIN
  INSERT INTO public.tests (slug, ordinal, title, short_title, source, total_questions)
  VALUES ('cb-og-4', 10, 'CB OG #4', 'CB OG #4', 'sat-practice-test-4-digital.pdf', 120)
  ON CONFLICT (slug) DO UPDATE SET ordinal=EXCLUDED.ordinal, title=EXCLUDED.title,
    short_title=EXCLUDED.short_title, source=EXCLUDED.source, total_questions=EXCLUDED.total_questions
  RETURNING id INTO v_test;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 1, 'reading-writing', 'Reading and Writing — Module 1', 1920, 33)
  ON CONFLICT (test_id, position) DO UPDATE SET section=EXCLUDED.section, label=EXCLUDED.label,
    time_limit_seconds=EXCLUDED.time_limit_seconds, question_count=EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '1-1', 1, 'mcq', 'The spacecraft OSIRIS-REx briefly made contact with the asteroid 101955 Bennu in 2020. NASA scientist Daniella DellaGiustina reports that despite facing the unexpected obstacle of a surface mostly covered in boulders, OSIRIS-REx successfully ______ a sample of the surface, gathering pieces of it to bring back to Earth.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"attached","B":"collected","C":"followed","D":"replaced"}'::jsonb, NULL, 'B', NULL, NULL, 2)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '1-2', 2, 'mcq', 'Research conducted by planetary scientist Katarina Miljkovic suggests that the Moon''s surface may not accurately ______ early impact events. When the Moon was still forming, its surface was softer, and asteroid or meteoroid impacts would have left less of an impression; thus, evidence of early impacts may no longer be present.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"reflect","B":"receive","C":"evaluate","D":"mimic"}'::jsonb, NULL, 'A', NULL, NULL, 2)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '1-3', 3, 'mcq', 'Handedness, a preferential use of either the right or left hand, typically is easy to observe in humans. Because this trait is present but less ______ in many other animals, animal-behavior researchers often employ tasks specially designed to reveal individual animals'' preferences for a certain hand or paw.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"recognizable","B":"intriguing","C":"significant","D":"useful"}'::jsonb, NULL, 'A', NULL, NULL, 3)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '1-4', 4, 'mcq', 'It is by no means ______ to recognize the influence of Dutch painter Hieronymus Bosch on Ali Banisadr''s paintings; indeed, Banisadr himself cites Bosch as an inspiration. However, some scholars have suggested that the ancient Mesopotamian poem Epic of Gilgamesh may have had a far greater impact on Banisadr''s work.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"substantial","B":"satisfying","C":"unimportant","D":"appropriate"}'::jsonb, NULL, 'C', NULL, NULL, 3)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '1-5', 5, 'mcq', 'The following text is adapted from Susan Glaspell''s 1912 short story "''Out There.''" An elderly shop owner is looking at a picture that he recently acquired and hopes to sell.

It did seem that the picture failed to fit in with the rest of the shop. A persuasive young fellow who claimed he was closing out his stock let the old man have it for what he called a song. It was only a little out-of-the-way store which subsisted chiefly on the framing of pictures. The old man looked around at his views of the city, his pictures of cats and dogs, his flaming bits of landscape. "Don''t belong in here," he fumed.

And yet the old man was secretly proud of his acquisition. There was a hidden dignity in his scowling as he shuffled about pondering the least ridiculous place for the picture.', NULL, 'Which choice best states the main purpose of the text?', '{"A":"To reveal the shop owner''s conflicted feelings about the new picture","B":"To convey the shop owner''s resentment of the person he got the new picture from","C":"To describe the items that the shop owner most highly prizes","D":"To explain differences between the new picture and other pictures in the shop"}'::jsonb, NULL, 'A', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '1-6', 6, 'mcq', 'The following text is from the 1923 poem "Black Finger" by Angelina Weld Grimké, a Black American writer. A cypress is a type of evergreen tree.

I have just seen a most beautiful thing,
Slim and still,
Against a gold, gold sky,
A straight black cypress,
Sensitive,
Exquisite,
A black finger
Pointing upwards.
Why, beautiful still finger, are you black?
And why are you pointing upwards?', NULL, 'Which choice best describes the overall structure of the text?', '{"A":"The speaker assesses a natural phenomenon, then questions the accuracy of her assessment.","B":"The speaker describes a distinctive sight in nature, then ponders what meaning to attribute to that sight.","C":"The speaker presents an outdoor scene, then considers a human behavior occurring within that scene.","D":"The speaker examines her surroundings, then speculates about their influence on her emotional state."}'::jsonb, NULL, 'B', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '1-7', 7, 'mcq', 'The following text is from Walt Whitman''s 1860 poem "Calamus 24."

I HEAR it is charged against me that I seek to destroy institutions;
But really I am neither for nor against institutions
(What indeed have I in common with them?—Or what with the destruction of them?),
Only I will establish in the Mannahatta [Manhattan] and in every city of These States, inland and seaboard,
And in the fields and woods, and above every keel [ship] little or large, that dents the water,
Without edifices, or rules, or trustees, or any argument,
The institution of the dear love of comrades.', NULL, 'Which choice best describes the overall structure of the text?', '{"A":"The speaker questions an increasingly prevalent attitude, then summarizes his worldview.","B":"The speaker regrets his isolation from others, then predicts a profound change in society.","C":"The speaker concedes his personal shortcomings, then boasts of his many achievements.","D":"The speaker addresses a criticism leveled against him, then announces a grand ambition of his."}'::jsonb, NULL, 'D', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '1-8', 8, 'mcq', 'The mimosa tree evolved in East Asia, where the beetle Bruchidius terrenus preys on its seeds. In 1785, mimosa trees were introduced to North America, far from any B. terrenus. But evolutionary links between predators and their prey can persist across centuries and continents. Around 2001, B. terrenus was introduced in southeastern North America near where botanist Shu-Mei Chang and colleagues had been monitoring mimosa trees. Within a year, 93 percent of the trees had been attacked by the beetles.', NULL, 'Which choice best describes the function of the third sentence in the overall structure of the text?', '{"A":"It states the hypothesis that Chang and colleagues had set out to investigate using mimosa trees and B. terrenus.","B":"It presents a generalization that is exemplified by the discussion of the mimosa trees and B. terrenus.","C":"It offers an alternative explanation for the findings of Chang and colleagues.","D":"It provides context that clarifies why the species mentioned spread to new locations."}'::jsonb, NULL, 'B', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '1-9', 9, 'mcq', 'Text 1
Conventional wisdom long held that human social systems evolved in stages, beginning with hunter-gatherers forming small bands of members with roughly equal status. The shift to agriculture about 12,000 years ago sparked population growth that led to the emergence of groups with hierarchical structures: associations of clans first, then chiefdoms, and finally, bureaucratic states.

Text 2
In a 2021 book, anthropologist David Graeber and archaeologist David Wengrow maintain that humans have always been socially flexible, alternately forming systems based on hierarchy and collective ones with decentralized leadership. The authors point to evidence that as far back as 50,000 years ago some hunter-gatherers adjusted their social structures seasonally, at times dispersing in small groups but also assembling into communities that included esteemed individuals.', NULL, 'Based on the texts, how would Graeber and Wengrow (Text 2) most likely respond to the "conventional wisdom" presented in Text 1?', '{"A":"By conceding the importance of hierarchical systems but asserting the greater significance of decentralized collective societies","B":"By disputing the idea that developments in social structures have followed a linear progression through distinct stages","C":"By acknowledging that hierarchical roles likely weren''t a part of social systems before the rise of agriculture","D":"By challenging the assumption that groupings of hunter-gatherers were among the earliest forms of social structure"}'::jsonb, NULL, 'B', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '1-10', 10, 'mcq', 'The following text is adapted from Frances Hodgson Burnett''s 1911 novel The Secret Garden. Mary, a young girl, recently found an overgrown hidden garden.

Mary was an odd, determined little person, and now she had something interesting to be determined about, she was very much absorbed, indeed. She worked and dug and pulled up weeds steadily, only becoming more pleased with her work every hour instead of tiring of it. It seemed to her like a fascinating sort of play.', NULL, 'Which choice best states the main idea of the text?', '{"A":"Mary hides in the garden to avoid doing her chores.","B":"Mary is getting bored with pulling up so many weeds in the garden.","C":"Mary is clearing out the garden to create a space to play.","D":"Mary feels very satisfied when she''s taking care of the garden."}'::jsonb, NULL, 'D', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '1-11', 11, 'mcq', 'The following text is from Ezra Pound''s 1909 poem "Hymn III," based on the work of Marcantonio Flaminio.

As a fragile and lovely flower unfolds its gleaming foliage on the breast of the fostering earth, if the dew and the rain draw it forth;
So doth my tender mind flourish, if it be fed with the sweet dew of the fostering spirit,
Lacking this, it beginneth straightway to languish, even as a floweret born upon dry earth, if the dew and the rain tend it not.', NULL, 'Based on the text, in what way is the human mind like a flower?', '{"A":"It becomes increasingly vigorous with the passage of time.","B":"It draws strength from changes in the weather.","C":"It requires proper nourishment in order to thrive.","D":"It perseveres despite challenging circumstances."}'::jsonb, NULL, 'C', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '1-12', 12, 'mcq', 'The following text is adapted from Jack London''s 1903 novel The Call of the Wild. Buck is a sled dog living with John Thornton in Yukon, Canada.

Thornton alone held [Buck]. The rest of mankind was as nothing. Chance travellers might praise or pet him; but he was cold under it all, and from a too demonstrative man he would get up and walk away. When Thornton''s partners, Hans and Pete, arrived on the long-expected raft, Buck refused to notice them till he learned they were close to Thornton; after that he tolerated them in a passive sort of way, accepting favors from them as though he favored them by accepting.', NULL, 'Which choice best states the main idea of the text?', '{"A":"Buck has become less social since he began living with Thornton.","B":"Buck mistrusts humans and does his best to avoid them.","C":"Buck has been especially well liked by most of Thornton''s friends.","D":"Buck holds Thornton in higher regard than any other person."}'::jsonb, NULL, 'D', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '1-13', 13, 'mcq', 'Bar graph titled "US States with the Greatest Number of Organic Farms in 2016." The horizontal axis lists states; the vertical axis is "Number of organic farms" ranging from 0 to 2,800 in increments of 200. Approximate values: California about 2,700; Wisconsin about 1,300; New York about 1,000; Pennsylvania about 800; Iowa about 700; Washington about 700.

Organic farming is a method of growing food that tries to reduce environmental harm by using natural forms of pest control and avoiding fertilizers made with synthetic materials. Organic farms are still a small fraction of the total farms in the United States, but they have been becoming more popular. According to the US Department of Agriculture, in 2016 California had between 2,600 and 2,800 organic farms and ______

(Figure: Bar graph: US States with the Greatest Number of Organic Farms in 2016. Vertical axis: Number of organic farms (0 to 2,800 by 200). Bars for several US states (e.g., California, Wisconsin, New York, Pennsylvania, Iowa, Washington).)', 'Bar graph: US States with the Greatest Number of Organic Farms in 2016. Vertical axis: Number of organic farms (0 to 2,800 by 200). Bars for several US states (e.g., California, Wisconsin, New York, Pennsylvania, Iowa, Washington).', 'Which choice most effectively uses data from the graph to complete the text?', '{"A":"Washington had between 600 and 800 organic farms.","B":"New York had fewer than 800 organic farms.","C":"Wisconsin and Iowa each had between 1,200 and 1,400 organic farms.","D":"Pennsylvania had more than 1,200 organic farms."}'::jsonb, NULL, 'A', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '1-14', 14, 'mcq', 'Biologist Valentina Gómez-Bahamón and her team have investigated two subspecies of the fork-tailed flycatcher bird that live in the same region in Colombia, but one subspecies migrates south for part of the year, and the other doesn''t. The researchers found that, due to slight differences in feather shape, the feathers of migratory forked-tailed flycatcher males make a sound during flight that is higher pitched than that made by the feathers of nonmigratory males. The researchers hypothesize that fork-tailed flycatcher females are attracted to the specific sound made by the males of their own subspecies, and that over time the females'' preference will drive further genetic and anatomical divergence between the subspecies.', NULL, 'Which finding, if true, would most directly support Gómez-Bahamón and her team''s hypothesis?', '{"A":"The feathers located on the wings of the migratory fork-tailed flycatchers have a narrower shape than those of the nonmigratory birds, which allows them to fly long distances.","B":"Over several generations, the sound made by the feathers of migratory male fork-tailed flycatchers grows progressively higher pitched relative to that made by the feathers of nonmigratory males.","C":"Fork-tailed flycatchers communicate different messages to each other depending on whether their feathers create high-pitched or low-pitched sounds.","D":"The breeding habits of the migratory and nonmigratory fork-tailed flycatchers remained generally the same over several generations."}'::jsonb, NULL, 'B', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '1-15', 15, 'mcq', 'Table titled "Ablation Rates for Three Elements in Cosmic Dust, by Dust Source." Columns: Element, SPC, AST, HTC, OCC. Rows: iron 20%, 28%, 90%, 98%; potassium 44%, 74%, 97%, 100%; sodium 45%, 75%, 99%, 100%.

Earth''s atmosphere is bombarded by cosmic dust originating from several sources: short-period comets (SPCs), particles from the asteroid belt (ASTs), Halley-type comets (HTCs), and Oort cloud comets (OCCs). Some of the dust''s material vaporizes in the atmosphere in a process called ablation, and the faster the particles move, the higher the rate of ablation. Astrophysicist Juan Diego Carrillo-Sánchez led a team that calculated average ablation rates for elements in the dust (such as iron and potassium) and showed that material in slower-moving SPC or AST dust has a lower rate than the same material in faster-moving HTC or OCC dust. For example, whereas the average ablation rate for iron from AST dust is 28%, the average rate for ______', NULL, 'Which choice most effectively uses data from the table to complete the example?', '{"A":"iron from SPC dust is 20%.","B":"sodium from OCC dust is 100%.","C":"iron from HTC dust is 90%.","D":"sodium from AST dust is 75%."}'::jsonb, NULL, 'C', NULL, NULL, 9)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '1-16', 16, 'mcq', 'Art collectives, like the United States- and Vietnam-based collective The Propeller Group or Cuba''s Los Carpinteros, are groups of artists who agree to work together: perhaps for stylistic reasons, or to advance certain shared political ideals, or to help mitigate the costs of supplies and studio space. Regardless of the reasons, art collectives usually involve some collaboration among the artists. Based on a recent series of interviews with various art collectives, an arts journalist claims that this can be difficult for artists who are often used to having sole control over their work.', NULL, 'Which quotation from the interviews best illustrates the journalist''s claim?', '{"A":"\"The first collective I joined included many amazingly talented artists, and we enjoyed each other''s company, but because we had a hard time sharing credit and responsibility for our work, the collective didn''t last.\"","B":"\"We work together, but that doesn''t mean that individual projects are equally the work of all of us. Many of our projects are primarily the responsibility of whoever originally proposed the work to the group.\"","C":"\"Having worked as a member of a collective for several years, it''s sometimes hard to recall what it was like to work alone without the collective''s support. But that support encourages my individual expression rather than limits it.\"","D":"\"Sometimes an artist from outside the collective will choose to collaborate with us on a project, but all of those projects fit within the larger themes of the work the collective does on its own.\""}'::jsonb, NULL, 'A', NULL, NULL, 9)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '1-17', 17, 'mcq', 'Table titled "Effects of Mycorrhizal Fungi on 3 Plant Species." Columns: Plant species, Mycorrhizal host, Average mass of plants grown in soil containing mycorrhizal fungi (in grams), Average mass of plants grown in soil treated to kill fungi (in grams). Rows: Corn, yes, 15.1, 3.8; Marigold, yes, 10.2, 2.4; Broccoli, no, 7.5, 7.

Mycorrhizal fungi in soil benefits many plants, substantially increasing the mass of some. A student conducted an experiment to illustrate this effect. The student chose three plant species for the experiment, including two that are mycorrhizal hosts (species known to benefit from mycorrhizal fungi) and one nonmycorrhizal species (a species that doesn''t benefit from and may even be harmed by mycorrhizal fungi). The student then grew several plants from each species both in soil containing mycorrhizal fungi and in soil that had been treated to kill mycorrhizal and other fungi. After several weeks, the student measured the plants'' average mass and was surprised to discover that ______', NULL, 'Which choice most effectively uses data from the table to complete the statement?', '{"A":"broccoli grown in soil containing mycorrhizal fungi had a slightly higher average mass than broccoli grown in soil that had been treated to kill fungi.","B":"corn grown in soil containing mycorrhizal fungi had a higher average mass than broccoli grown in soil containing mycorrhizal fungi.","C":"marigolds grown in soil containing mycorrhizal fungi had a much higher average mass than marigolds grown in soil that had been treated to kill fungi.","D":"corn had the highest average mass of all three species grown in soil that had been treated to kill fungi, while marigolds had the lowest."}'::jsonb, NULL, 'A', NULL, NULL, 10)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '1-18', 18, 'mcq', 'Several artworks found among the ruins of the ancient Roman city of Pompeii depict a female figure fishing with a cupid nearby. Some scholars have asserted that the figure is the goddess Venus, since she is known to have been linked with cupids in Roman culture, but University of Leicester archaeologist Carla Brain suggests that cupids may have also been associated with fishing generally. The fact that a cupid is shown near the female figure, therefore, ______', NULL, 'Which choice most logically completes the text?', '{"A":"is not conclusive evidence that the figure is Venus.","B":"suggests that Venus was often depicted fishing.","C":"eliminates the possibility that the figure is Venus.","D":"would be difficult to account for if the figure is not Venus."}'::jsonb, NULL, 'A', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '1-19', 19, 'mcq', 'Literary agents estimate that more than half of all nonfiction books credited to a celebrity or other public figure are in fact written by ghostwriters, professional authors who are paid to write other ______ but whose names never appear on book covers.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"people''s stories","B":"peoples story''s","C":"peoples stories","D":"people''s story''s"}'::jsonb, NULL, 'A', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '1-20', 20, 'mcq', 'Like other amphibians, the wood frog (Rana sylvatica) is unable to generate its own heat, so during periods of subfreezing temperatures, it ______ by producing large amounts of glucose, a sugar that helps prevent damaging ice from forming inside its cells.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"had survived","B":"survived","C":"would survive","D":"survives"}'::jsonb, NULL, 'D', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '1-21', 21, 'mcq', 'After a spate of illnesses as a child, Wilma Rudolph was told she might never walk again. Defying all odds, Rudolph didn''t just walk, she ______ the 1960 Summer Olympics in Rome, she won both the 100- and 200-meter dashes and clinched first place for her team in the 4 ×100-meter relay, becoming the first US woman to win three gold medals in a single Olympics.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"ran—fast—during","B":"ran—fast during","C":"ran—fast, during","D":"ran—fast. During"}'::jsonb, NULL, 'D', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '1-22', 22, 'mcq', 'In many of her landscape paintings from the 1970s and 1980s, Lebanese American artist Etel Adnan worked to capture the essence of California''s fog-shrouded Mount Tamalpais region through abstraction, using splotches of color to represent the area''s features. Interestingly, the triangle representing the mountain itself ______ among the few defined figures in her paintings.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"are","B":"have been","C":"were","D":"is"}'::jsonb, NULL, 'D', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '1-23', 23, 'mcq', 'Seneca sculptor Marie Watt''s blanket art comes in a range of shapes and sizes. In 2004, Watt sewed strips of blankets together to craft a 10-by-13-inch ______ in 2014, she arranged folded blankets into two large stacks and then cast them in bronze, creating two curving 18-foot-tall blue-bronze pillars.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"sampler later,","B":"sampler;","C":"sampler,","D":"sampler, later,"}'::jsonb, NULL, 'B', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '1-24', 24, 'mcq', 'African American Percy Julian was a scientist and entrepreneur whose work helped people around the world to see. Named in 1999 as one of the greatest achievements by a US chemist in the past hundred years, ______ led to the first mass-produced treatment for glaucoma.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"Julian synthesized the alkaloid physostigmine in 1935; it","B":"in 1935 Julian synthesized the alkaloid physostigmine, which","C":"Julian''s 1935 synthesis of the alkaloid physostigmine","D":"the alkaloid physostigmine was synthesized by Julian in 1935 and"}'::jsonb, NULL, 'C', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '1-25', 25, 'mcq', 'The Arctic-Alpine Botanic Garden in Norway and the Jardim Botânico of Rio de Janeiro in Brazil are two of many botanical gardens around the world dedicated to growing diverse plant ______ fostering scientific research; and educating the public about plant conservation.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"species, both native and nonnative,","B":"species, both native and nonnative;","C":"species; both native and nonnative,","D":"species both native and nonnative,"}'::jsonb, NULL, 'B', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '1-26', 26, 'mcq', 'Sociologist Alton Okinaka sits on the review board tasked with adding new sites to the Hawai''i Register of Historic Places, which includes Pi''ilanihale Heiau and the ''Ōpaeka''a Road Bridge. Okinaka doesn''t make such decisions ______ all historical designations must be approved by a group of nine other experts from the fields of architecture, archaeology, history, and Hawaiian culture.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"single-handedly, however;","B":"single-handedly; however,","C":"single-handedly, however,","D":"single-handedly however"}'::jsonb, NULL, 'A', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '1-27', 27, 'mcq', 'In 1968, US Congressman John Conyers introduced a bill to establish a national holiday in honor of Dr. Martin Luther King Jr. The bill didn''t make it to a vote, but Conyers was determined. He teamed up with Shirley Chisholm, the first Black woman to be elected to Congress, and they resubmitted the bill every session for the next fifteen years. ______ in 1983, the bill passed.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Instead,","B":"Likewise,","C":"Finally,","D":"Additionally,"}'::jsonb, NULL, 'C', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 28, '1-28', 28, 'mcq', 'Geoscientists have long considered Hawaii''s Mauna Loa volcano to be Earth''s largest shield volcano by volume, measuring approximately 74,000 cubic kilometers. ______ according to a 2020 study by local geoscientist Michael Garcia, Hawaii''s Pūhāhonu shield volcano is significantly larger, boasting a volume of about 148,000 cubic kilometers.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Secondly,","B":"Consequently,","C":"Moreover,","D":"However,"}'::jsonb, NULL, 'D', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 29, '1-29', 29, 'mcq', 'Samuel Coleridge-Taylor was a prominent classical music composer from England who toured the US three times in the early 1900s. The child of a West African father and an English mother, Coleridge-Taylor emphasized his mixed-race ancestry. For example, he referred to himself as Anglo-African. ______ he incorporated the sounds of traditional African music into his classical music compositions.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"In addition,","B":"Actually,","C":"However,","D":"Regardless,"}'::jsonb, NULL, 'A', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 30, '1-30', 30, 'mcq', 'In 2019, researcher Patricia Jurado Gonzalez and food historian Nawal Nasrallah prepared a stew from a 4,000-year-old recipe found on a Mesopotamian clay tablet. When they tasted the dish, known as pašrūtum ("unwinding"), they found that it had a mild taste and inspired a sense of calm. ______ the researchers, knowing that dishes were sometimes named after their intended effects, theorized that the dish''s name, "unwinding," referred to its function: to help ancient diners relax.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Therefore,","B":"Alternately,","C":"Nevertheless,","D":"Likewise,"}'::jsonb, NULL, 'A', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 31, '1-31', 31, 'mcq', 'While researching a topic, a student has taken the following notes:
• Chemical leavening agents cause carbon dioxide to be released within a liquid batter, making the batter rise as it bakes.
• Baking soda and baking powder are chemical leavening agents.
• Baking soda is pure sodium bicarbonate.
• To produce carbon dioxide, baking soda needs to be mixed with liquid and an acidic ingredient such as honey.
• Baking powder is a mixture of sodium bicarbonate and an acid.
• To produce carbon dioxide, baking powder needs to be mixed with liquid but not with an acidic ingredient.', NULL, 'The student wants to emphasize a difference between baking soda and baking powder. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"To make batters rise, bakers use chemical leavening agents such as baking soda and baking powder.","B":"Baking soda and baking powder are chemical leavening agents that, when mixed with other ingredients, cause carbon dioxide to be released within a batter.","C":"Baking soda is pure sodium bicarbonate, and honey is a type of acidic ingredient.","D":"To produce carbon dioxide within a liquid batter, baking soda needs to be mixed with an acidic ingredient, whereas baking powder does not."}'::jsonb, NULL, 'D', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 32, '1-32', 32, 'mcq', 'While researching a topic, a student has taken the following notes:
• Soo Sunny Park is a Korean American artist who uses light as her primary medium of expression.
• She created her work Unwoven Light in 2013.
• Unwoven Light featured a chain-link fence fitted with iridescent plexiglass tiles.
• When light passed through the fence, colorful prisms formed.', NULL, 'The student wants to describe Unwoven Light to an audience unfamiliar with Soo Sunny Park. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Park''s 2013 installation Unwoven Light, which included a chain-link fence and iridescent tiles made from plexiglass, featured light as its primary medium of expression.","B":"Korean American light artist Soo Sunny Park created Unwoven Light in 2013.","C":"The chain-link fence in Soo Sunny Park''s Unwoven Light was fitted with tiles made from iridescent plexiglass.","D":"In Unwoven Light, a 2013 work by Korean American artist Soo Sunny Park, light formed colorful prisms as it passed through a fence Park had fitted with iridescent tiles."}'::jsonb, NULL, 'D', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 33, '1-33', 33, 'mcq', 'While researching a topic, a student has taken the following notes:
• Cambodia''s Angkor Wat was built in the 1100s to honor the Hindu god Vishnu.
• It has been a Buddhist temple since the sixteenth century.
• Decorrelation stretch analysis is a novel digital imaging technique that enhances the contrast between colors in a photograph.
• Archaeologist Noel Hidalgo Tan applied decorrelation stretch analysis to photographs he had taken of Angkor Wat''s plaster walls.
• Tan''s analysis revealed hundreds of images unknown to researchers.', NULL, 'The student wants to present Tan''s research to an audience unfamiliar with Angkor Wat. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Tan photographed Angkor Wat''s plaster walls and then applied decorrelation stretch analysis to the photographs.","B":"Decorrelation stretch analysis is a novel digital imaging technique that Tan used to enhance the contrast between colors in a photograph.","C":"Using a novel digital imaging technique, Tan revealed hundreds of images hidden on the walls of Angkor Wat, a Cambodian temple.","D":"Built to honor a Hindu god before becoming a Buddhist temple, Cambodia''s Angkor Wat concealed hundreds of images on its plaster walls."}'::jsonb, NULL, 'C', NULL, NULL, 15)
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
  VALUES (v_mod, 1, '2-1', 1, 'mcq', 'The fashion resale market, in which consumers purchase secondhand clothing from stores and online sellers, generated nearly $30 billion globally in 2019. Expecting to see continued growth, some analysts ______ that revenues will more than double by 2028.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"produced","B":"denied","C":"worried","D":"predicted"}'::jsonb, NULL, 'D', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '2-2', 2, 'mcq', 'Artificially delivering biomolecules to plant cells is an important component of protecting plants from pathogens, but it is difficult to transmit biomolecules through the layers of the plant cell wall. Markita del Carpio Landry and her colleagues have shown that it may be possible to ______ this problem by transmitting molecules through carbon nanotubes, which can cross cell walls.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"conceptualize","B":"neglect","C":"illustrate","D":"overcome"}'::jsonb, NULL, 'D', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '2-3', 3, 'mcq', 'Particle physicists like Ayana Holloway Arce and Aida El-Khadra spend much of their time ______ what is invisible to the naked eye: using sophisticated technology, they closely examine the behavior of subatomic particles, the smallest detectable parts of matter.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"selecting","B":"inspecting","C":"creating","D":"dividing"}'::jsonb, NULL, 'B', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '2-4', 4, 'mcq', 'Anthropologist Kristian J. Carlson and colleagues examined the fossilized clavicle and shoulder bones of a 3.6-million-year-old early hominin known as "Little Foot." They found that these bones were ______ the clavicle and shoulder bones of modern apes that are frequent climbers, such as gorillas and chimpanzees, suggesting that Little Foot had adapted to life in the trees.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"surpassed by","B":"comparable to","C":"independent of","D":"obtained from"}'::jsonb, NULL, 'B', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '2-5', 5, 'mcq', 'Rydra Wong, the protagonist of Samuel R. Delany''s 1966 novel Babel-17, is a poet, an occupation which, in Delany''s work, is not ______ nearly a dozen of the characters that populate his novels are poets or writers.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"infallible","B":"atypical","C":"lucrative","D":"tedious"}'::jsonb, NULL, 'B', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '2-6', 6, 'mcq', 'For a 2020 exhibition, photographer and neurobiologist Okwarù Joycìnea ______ a series of new images based on a series of alphabet posters from the 1970s known as the "Black ABCs," which featured Black children from Chicago. Joycìnea photographed the now-adult models and layered the photos over magnified images of the models'' cells, resulting in what she called "micro and macro portraitures."', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"validated","B":"created","C":"challenged","D":"restored"}'::jsonb, NULL, 'B', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '2-7', 7, 'mcq', 'In addition to being an accomplished psychologist himself, Francis Cecil Sumner was a ______ increasing the opportunity for Black students to study psychology, helping to found the psychology department at Howard University, a historically Black university, in 1930.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"proponent of","B":"supplement to","C":"beneficiary of","D":"distraction for"}'::jsonb, NULL, 'A', NULL, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '2-8', 8, 'mcq', 'Whether the reign of a French monarch such as Hugh Capet or Henry I was historically consequential or relatively uneventful, its trajectory was shaped by questions of legitimacy and therefore cannot be understood without a corollary understanding of the factors that allowed the monarch to ______ his right to hold the throne.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"reciprocate","B":"annotate","C":"buttress","D":"disengage"}'::jsonb, NULL, 'C', NULL, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '2-9', 9, 'mcq', 'Some bird species don''t raise their own chicks. Instead, adult females lay their eggs in other nests, next to another bird species'' own eggs. Female cuckoos have been seen quickly laying eggs in the nests of other bird species when those birds are not looking for food. After the eggs hatch, the noncuckoo parents will typically raise the cuckoo chicks as if they were their own offspring, even if the cuckoos look very different from the other chicks.', NULL, 'Which choice best describes the function of the underlined sentence in the text as a whole?', '{"A":"It introduces a physical feature of female cuckoos that is described later in the text.","B":"It describes the appearance of the cuckoo nests mentioned earlier in the text.","C":"It offers a detail about how female cuckoos carry out the behavior discussed in the text.","D":"It explains how other birds react to the female cuckoo behavior discussed in the text."}'::jsonb, NULL, 'C', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '2-10', 10, 'mcq', 'Cats can judge unseen people''s positions in space by the sound of their voices and thus react with surprise when the same person calls to them from two different locations in a short span of time. Saho Takagi and colleagues reached this conclusion by measuring cats'' levels of surprise based on their ear and head movements while the cats heard recordings of their owners'' voices from two speakers spaced far apart. Cats exhibited a low level of surprise when owners'' voices were played twice from the same speaker, but they showed a high level of surprise when the voice was played once each from the two different speakers.', NULL, 'According to the text, how did the researchers determine the level of surprise displayed by the cats in the study?', '{"A":"They watched how each cat moved its ears and head.","B":"They examined how each cat reacted to the voice of a stranger.","C":"They studied how each cat physically interacted with its owner.","D":"They tracked how each cat moved around the room."}'::jsonb, NULL, 'A', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '2-11', 11, 'mcq', 'A student performs an experiment testing her hypothesis that a slightly acidic soil environment is more beneficial for the growth of the plant Brassica rapa parachinensis (a vegetable commonly known as choy sum) than a neutral soil environment. She plants sixteen seeds of choy sum in a mixture of equal amounts of coffee grounds (which are highly acidic) and potting soil and another sixteen seeds in potting soil without coffee grounds as the control for the experiment. The two groups of seeds were exposed to the same growing conditions and monitored for three weeks.', NULL, 'Which finding, if true, would most directly weaken the student''s hypothesis?', '{"A":"The choy sum planted in the soil without coffee grounds were significantly taller at the end of the experiment than the choy sum planted in the mixture of soil and coffee grounds.","B":"The choy sum grown in the soil without coffee grounds weighed significantly less at the end of the experiment than the choy sum grown in the mixture of soil and coffee grounds.","C":"The choy sum seeds planted in the soil without coffee grounds sprouted significantly later in the experiment than did the seeds planted in the mixture of soil and coffee grounds.","D":"Significantly fewer of the choy sum seeds planted in the soil without coffee grounds germinated than did the choy sum seeds planted in the mixture of soil and coffee grounds."}'::jsonb, NULL, 'A', NULL, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '2-12', 12, 'mcq', '"The Young Girl" is a 1920 short story by Katherine Mansfield. In the story, the narrator takes an unnamed seventeen-year-old girl and her younger brother out for a meal. In describing the teenager, Mansfield frequently contrasts the character''s pleasant appearance with her unpleasant attitude, as when Mansfield writes of the teenager, ______', NULL, 'Which quotation from "The Young Girl" most effectively illustrates the claim?', '{"A":"\"I heard her murmur, ''I can''t bear flowers on a table.'' They had evidently been giving her intense pain, for she positively closed her eyes as I moved them away.\"","B":"\"While we waited she took out a little, gold powder-box with a mirror in the lid, shook the poor little puff as though she loathed it, and dabbed her lovely nose.\"","C":"\"I saw, after that, she couldn''t stand this place a moment longer, and, indeed, she jumped up and turned away while I went through the vulgar act of paying for the tea.\"","D":"\"She didn''t even take her gloves off. She lowered her eyes and drummed on the table. When a faint violin sounded she winced and bit her lip again. Silence.\""}'::jsonb, NULL, 'B', NULL, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '2-13', 13, 'mcq', 'Figure (line graph) titled "Economic Policy Uncertainty in the United Kingdom, 2005–2010": x-axis = Year (2005, 2006, 2007, 2008, 2009, 2010); y-axis = Uncertainty (larger values = more uncertainty), scaled 0, 50, 100, 150, 200. Three lines are plotted: tax and public spending policy, trade policy, and general economic policy.

High levels of public uncertainty about which economic policies a country will adopt can make planning difficult for businesses, but measures of such uncertainty have not tended to be very detailed. Recently, however, economist Sandile Hlatshwayo analyzed trends in news reports to derive measures not only for general economic policy uncertainty but also for uncertainty related to specific areas of economic policy, like tax or trade policy. One revelation of her work is that a general measure may not fully reflect uncertainty about specific areas of policy, as in the case of the United Kingdom, where general economic policy uncertainty ______

(Figure: Line graph: Economic Policy Uncertainty in the United Kingdom, 2005–2010. X-axis: Year (2005–2010). Y-axis: Uncertainty (larger values = more uncertainty), 0–200. Three lines: tax and public spending policy; trade policy; general economic policy.)', 'Line graph: Economic Policy Uncertainty in the United Kingdom, 2005–2010. X-axis: Year (2005–2010). Y-axis: Uncertainty (larger values = more uncertainty), 0–200. Three lines: tax and public spending policy; trade policy; general economic policy.', 'Which choice most effectively uses data from the graph to illustrate the claim?', '{"A":"aligned closely with uncertainty about tax and public spending policy in 2005 but differed from uncertainty about tax and public spending policy by a large amount in 2009.","B":"was substantially lower than uncertainty about tax and public spending policy each year from 2005 to 2010.","C":"reached its highest level between 2005 and 2010 in the same year that uncertainty about trade policy and tax and public spending policy reached their lowest levels.","D":"was substantially lower than uncertainty about trade policy in 2005 and substantially higher than uncertainty about trade policy in 2010."}'::jsonb, NULL, 'D', NULL, NULL, 23)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '2-14', 14, 'mcq', 'Linguist Deborah Tannen has cautioned against framing contentious issues in terms of two highly competitive perspectives, such as pro versus con. According to Tannen, this debate-driven approach can strip issues of their complexity and, when looked at in front of an audience, can be less informative than the presentation of multiple perspectives in a noncompetitive format. To test Tannen''s hypothesis, students conducted a study in which they showed participants one of three different versions of local news commentary about the same issue. Each version featured a debate between two commentators with opposing views, a panel of three commentators with various views, or a single commentator.', NULL, 'Which finding from the students'' study, if true, would most strongly support Tannen''s hypothesis?', '{"A":"On average, participants perceived commentators in the debate as more knowledgeable about the issue than commentators in the panel.","B":"On average, participants perceived commentators in the panel as more knowledgeable about the issue than the single commentator.","C":"On average, participants who watched the panel correctly answered more questions about the issue than those who watched the debate or the single commentator did.","D":"On average, participants who watched the single commentator correctly answered more questions about the issue than those who watched the debate did."}'::jsonb, NULL, 'C', NULL, NULL, 24)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '2-15', 15, 'mcq', 'King Lear is a circa 1606 play by William Shakespeare. In the play, the character of King Lear attempts to test his three daughters'' devotion to him. He later expresses regret for his actions, as is evident when he ______', NULL, 'Which choice most effectively uses a quotation from King Lear to illustrate the claim?', '{"A":"says of himself, \"I am a man / more sinned against than sinning.\"","B":"says during a growing storm, \"This tempest will not give me leave to ponder / On things would hurt me more.\"","C":"says to himself while striking his head, \"Beat at this gate that let thy folly in / And thy dear judgement out!\"","D":"says of himself, \"I will do such things— / What they are yet, I know not; but they shall be / The terrors of the earth!\""}'::jsonb, NULL, 'C', NULL, NULL, 24)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '2-16', 16, 'mcq', 'Many of William Shakespeare''s tragedies address broad themes that still appeal to today''s audiences. For instance, Romeo and Juliet, which is set in the Italy of Shakespeare''s time, tackles the themes of parents versus children and love versus hate, and the play continues to be read and produced widely around the world. But understanding Shakespeare''s so-called history plays can require a knowledge of several centuries of English history. Consequently, ______', NULL, 'Which choice most logically completes the text?', '{"A":"many theatergoers and readers today are likely to find Shakespeare''s history plays less engaging than the tragedies.","B":"some of Shakespeare''s tragedies are more relevant to today''s audiences than twentieth-century plays.","C":"Romeo and Juliet is the most thematically accessible of all Shakespeare''s tragedies.","D":"experts in English history tend to prefer Shakespeare''s history plays to other works."}'::jsonb, NULL, 'A', NULL, NULL, 24)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '2-17', 17, 'mcq', 'Ancestral Puebloans, the civilization from which present-day Pueblo tribes descended, emerged as early as 1500 B.C.E. in an area of what is now the southwestern United States and dispersed suddenly in the late 1200s C.E., abandoning established villages with systems for farming crops and turkeys. Recent analysis comparing turkey remains at Mesa Verde, one such village in southern Colorado, to samples from modern turkey populations in the Rio Grande Valley of north central New Mexico determined that the latter birds descended in part from turkeys cultivated at Mesa Verde, with shared genetic markers appearing only after 1280. Thus, researchers concluded that ______', NULL, 'Which choice most logically completes the text?', '{"A":"conditions of the terrain in the Rio Grande Valley and Mesa Verde had greater similarities in the past than they do today.","B":"some Ancestral Puebloans migrated to the Rio Grande Valley in the late 1200s and carried farming practices with them.","C":"Indigenous peoples living in the Rio Grande Valley primarily planted crops and did not cultivate turkeys before 1280.","D":"the Ancestral Puebloans of Mesa Verde likely adopted the farming practices of Indigenous peoples living in other regions."}'::jsonb, NULL, 'B', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '2-18', 18, 'mcq', 'One challenge when researching whether holding elected office changes a person''s behavior is the problem of ensuring that the experiment has an appropriate control group. To reveal the effect of holding office, researchers must compare people who hold elected office with people who do not hold office but who are otherwise similar to the office-holders. Since researchers are unable to control which politicians win elections, they therefore ______', NULL, 'Which choice most logically completes the text?', '{"A":"struggle to find valid data about the behavior of politicians who do not currently hold office.","B":"can only conduct valid studies with people who have previously held office rather than people who presently hold office.","C":"should select a control group of people who differ from office-holders in several significant ways.","D":"will find it difficult to identify a group of people who can function as an appropriate control group for their studies."}'::jsonb, NULL, 'D', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '2-19', 19, 'mcq', 'In his groundbreaking book Bengali Harlem and the Lost Histories of South Asian America, Vivek Bald uses newspaper articles, census records, ships'' logs, and memoirs to tell the ______ who made New York City their home in the early twentieth century.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"story''s of the South Asian immigrants","B":"story''s of the South Asian immigrants''","C":"stories of the South Asian immigrants","D":"stories'' of the South Asian immigrant''s"}'::jsonb, NULL, 'C', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '2-20', 20, 'mcq', 'In her two major series "Memory Test" and "Autobiography," painter Howardena Pindell explored themes ______ healing, self-discovery, and memory by cutting and sewing back together pieces of canvas and inserting personal artifacts, such as postcards, into some of the paintings.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"of","B":"of,","C":"of—","D":"of:"}'::jsonb, NULL, 'A', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '2-21', 21, 'mcq', 'Both Sona Charaipotra, an Indian American, and Dhonielle Clayton, an African American, grew up frustrated by the lack of diverse characters in books for young people. In 2011, these two writers joined forces to found CAKE Literary, a book packaging ______ specializes in the creation and promotion of stories told from diverse perspectives for children and young adults.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"company,","B":"company that","C":"company","D":"company, that"}'::jsonb, NULL, 'B', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '2-22', 22, 'mcq', 'A study led by scientist Rebecca Kirby at the University of Wisconsin–Madison found that black bears that eat human food before hibernation have increased levels of a rare carbon isotope, ______ due to the higher 13C levels in corn and cane sugar. Bears with these elevated levels were also found to have much shorter hibernation periods on average.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"carbon-13, (13C),","B":"carbon-13 (13C)","C":"carbon-13, (13C)","D":"carbon-13 (13C),"}'::jsonb, NULL, 'D', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '2-23', 23, 'mcq', 'In 2010, archaeologist Noel Hidalgo Tan was visiting the twelfth-century temple of Angkor Wat in Cambodia when he noticed markings of red paint on the temple ______ the help of digital imaging techniques, he discovered the markings to be part of an elaborate mural containing over 200 paintings.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"walls, with","B":"walls with","C":"walls with—","D":"walls. With"}'::jsonb, NULL, 'D', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '2-24', 24, 'mcq', 'Working from an earlier discovery of Charpentier''s, chemists Emmanuelle Charpentier and Jennifer Doudna—winners of the 2020 Nobel Prize in Chemistry—re-created and then reprogrammed the so-called "genetic scissors" of a species of DNA-cleaving bacteria ______ a tool that is revolutionizing the field of gene technology.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"to forge","B":"forging","C":"forged","D":"and forging"}'::jsonb, NULL, 'A', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '2-25', 25, 'mcq', 'In 2016, engineer Vanessa Galvez oversaw the installation of 164 bioswales, vegetated channels designed to absorb and divert stormwater, along the streets of Queens, New York. By reducing the runoff flowing into city sewers, ______', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"the mitigation of both street flooding and the resulting pollution of nearby waterways has been achieved by bioswales.","B":"the bioswales have mitigated both street flooding and the resulting pollution of nearby waterways.","C":"the bioswales'' mitigation of both street flooding and the resulting pollution of nearby waterways has been achieved.","D":"both street flooding and the resulting pollution of nearby waterways have been mitigated by bioswales."}'::jsonb, NULL, 'B', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '2-26', 26, 'mcq', 'A study published by Rice University geoscientist Ming Tang in 2019 offers a new explanation for the origin of Earth''s ______ structures called arcs, towering ridges that form when a dense oceanic plate subducts under a less dense continental plate, melts in the mantle below, and then rises and bursts through the continental crust above.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"continents geological","B":"continents, geological","C":"continents geological,","D":"continents. Geological"}'::jsonb, NULL, 'B', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '2-27', 27, 'mcq', 'During a 2021 launch, Rocket Labs'' Electron rocket experienced an unexpected failure: its second-stage booster shut down suddenly after ignition. ______ instead of downplaying the incident, Rocket Labs'' CEO publicly acknowledged what happened and apologized for the loss of the rocket''s payload, which had consisted of two satellites.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Afterward,","B":"Additionally,","C":"Indeed,","D":"Similarly,"}'::jsonb, NULL, 'A', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 28, '2-28', 28, 'mcq', 'When soil becomes contaminated by toxic metals, it can be removed from the ground and disposed of in a landfill. ______ contaminated soil can be detoxified via phytoremediation: plants that can withstand high concentrations of metals absorb the pollutants and store them in their shoots, which are then cut off and safely disposed of, preserving the health of the plants.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Alternatively,","B":"Specifically,","C":"For example,","D":"As a result,"}'::jsonb, NULL, 'A', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 29, '2-29', 29, 'mcq', 'While researching a topic, a student has taken the following notes:
• The calendar used by most of the world (the Gregorian calendar) has 365 days.
• Because 365 days can''t be divided evenly by 7 (the number of days in a week), calendar dates fall on a different day of the week each year.
• The Hanke-Henry permanent calendar, developed as an alternative to the Gregorian calendar, has 364 days.
• Because 364 can be divided evenly by 7, calendar dates fall on the same day of the week each year, which supports more predictable scheduling.', NULL, 'The student wants to explain an advantage of the Hanke-Henry calendar. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"The Gregorian calendar has 365 days, which is one day longer than the Hanke-Henry permanent calendar.","B":"Adopting the Hanke-Henry permanent calendar would help solve a problem with the Gregorian calendar.","C":"Designed so calendar dates would occur on the same day of the week each year, the Hanke-Henry calendar supports more predictable scheduling than does the Gregorian calendar.","D":"The Hanke-Henry permanent calendar was developed as an alternative to the Gregorian calendar, which is currently the most used calendar in the world."}'::jsonb, NULL, 'C', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 30, '2-30', 30, 'mcq', 'While researching a topic, a student has taken the following notes:
• The Haudenosaunee Confederacy is a nearly 1,000-year-old alliance of six Native nations in the northeastern US.
• The members are bound by a centuries-old agreement known as the Great Law of Peace.
• Historian Bruce Johansen is one of several scholars who believe that the principles of the Great Law of Peace influenced the US Constitution.
• This theory is called the influence theory.
• Johansen cites the fact that Benjamin Franklin and Thomas Jefferson both studied the Haudenosaunee Confederacy.', NULL, 'The student wants to present the influence theory to an audience unfamiliar with the Haudenosaunee Confederacy. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Historian Bruce Johansen believes that the Great Law of Peace was very influential.","B":"The influence theory is supported by the fact that Benjamin Franklin and Thomas Jefferson both studied the Haudenosaunee Confederacy.","C":"The influence theory holds that the principles of the Great Law of Peace, a centuries-old agreement binding six Native nations in the northeastern US, influenced the US Constitution.","D":"Native people, including the members of the Haudenosaunee Confederacy, influenced the founding of the US in many different ways."}'::jsonb, NULL, 'C', NULL, NULL, 29)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 31, '2-31', 31, 'mcq', 'While researching a topic, a student has taken the following notes:
• In 1999, astronomer Todd Henry studied the differences in surface temperature between the Sun and nearby stars.
• His team mapped all stars within 10 parsecs (approximately 200 trillion miles) of the Sun.
• The surface temperature of the Sun is around 9,800°F, which classifies it as a G star.
• 327 of the 357 stars in the study were classified as K or M stars, with surface temperatures under 8,900°F (cooler than the Sun).
• 11 of the 357 stars in the study were classified as A or F stars, with surface temperatures greater than 10,300°F (hotter than the Sun).', NULL, 'The student wants to emphasize how far the Sun is relative to nearby stars. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"At around 9,800°F, which classifies it as a G star, the Sun is hotter than most but not all of the stars within 10 parsecs of it.","B":"Astronomer Todd Henry determined that the Sun, at around 9,800°F, is a G star, and several other stars within a 10-parsec range are A or F stars.","C":"Of the 357 stars within ten parsecs of the Sun, 327 are classified as K or M stars, with surface temperatures under 8,900°F.","D":"While most of the stars within 10 parsecs of the Sun are classified as K, M, A, or F stars, the Sun is classified as a G star due to its surface temperature of 9,800°F."}'::jsonb, NULL, 'A', NULL, NULL, 29)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 32, '2-32', 32, 'mcq', 'While researching a topic, a student has taken the following notes:
• The Atlantic Monthly magazine was first published in 1857.
• The magazine focused on politics, art, and literature.
• In 2019, historian Cathryn Halverson published the book Faraway Women and the "Atlantic Monthly."
• Its subject is female authors whose autobiographies appeared in the magazine in the early 1900s.
• One of the authors discussed is Juanita Harrison.', NULL, 'The student wants to introduce Cathryn Halverson''s book to an audience already familiar with the Atlantic Monthly. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Cathryn Halverson''s Faraway Women and the \"Atlantic Monthly\" discusses female authors whose autobiographies appeared in the magazine in the early 1900s.","B":"A magazine called the Atlantic Monthly, referred to in Cathryn Halverson''s book title, was first published in 1857.","C":"Faraway Women and the \"Atlantic Monthly\" features contributors to the Atlantic Monthly, first published in 1857 as a magazine focusing on politics, art, and literature.","D":"An author discussed by Cathryn Halverson is Juanita Harrison, whose autobiography appeared in the Atlantic Monthly in the early 1900s."}'::jsonb, NULL, 'A', NULL, NULL, 30)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 33, '2-33', 33, 'mcq', 'While researching a topic, a student has taken the following notes:
• The magnificent frigatebird (Fregata magnificens) is a species of seabird that feeds mainly on fish, tuna, squid, and other small sea animals.
• It is unusual among seabirds in that it doesn''t dive into the water for prey.
• One way it acquires food is by using its hook-tipped bill to snatch prey from the surface of the water.
• Another way it acquires food is by taking it from weaker birds by force.
• This behavior is known as kleptoparasitism.', NULL, 'The student wants to emphasize a similarity between the two ways a magnificent frigatebird acquires food. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"A magnificent frigatebird never dives into the water; instead using its hook-tipped bill to snatch prey from the surface.","B":"Neither of a magnificent frigatebird''s two ways of acquiring food requires the bird to dive into the water.","C":"Of the magnificent frigatebird''s two ways of acquiring food, only one is known as kleptoparasitism.","D":"In addition to snatching prey from the water with its hook-tipped bill, a magnificent frigatebird takes food from other birds by force."}'::jsonb, NULL, 'B', NULL, NULL, 30)
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
  VALUES (v_mod, 1, '3-1', 1, 'mcq', 'A group of students voted on five after-school activities. The bar graph shows the number of students who voted for each of the five activities.

(Figure: Bar graph titled with vertical axis ''Number of students'' (gridlines from 0 to 50 in increments of 5) and horizontal axis ''Activity'' (values 1 through 5). Approximate bar heights: activity 1 = 29, activity 2 = 31, activity 3 = 39, activity 4 = 43, activity 5 = 48.)', 'Bar graph titled with vertical axis ''Number of students'' (gridlines from 0 to 50 in increments of 5) and horizontal axis ''Activity'' (values 1 through 5). Approximate bar heights: activity 1 = 29, activity 2 = 31, activity 3 = 39, activity 4 = 43, activity 5 = 48.', 'How many students chose activity 3?', '{"A":"25","B":"39","C":"48","D":"50"}'::jsonb, NULL, 'B', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '3-2', 2, 'mcq', NULL, NULL, 'What percentage of 300 is 75?', '{"A":"25%","B":"50%","C":"75%","D":"225%"}'::jsonb, NULL, 'A', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '3-3', 3, 'mcq', '$\dfrac{x^2}{25} = 36$', NULL, 'What is a solution to the given equation?', '{"A":"6","B":"30","C":"450","D":"900"}'::jsonb, NULL, 'B', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '3-4', 4, 'mcq', NULL, NULL, '3 more than 8 times a number $x$ is equal to 83. Which equation represents this situation?', '{"A":"$(3)(8)x = 83$","B":"$8x = 83 + 3$","C":"$3x + 8 = 83$","D":"$8x + 3 = 83$"}'::jsonb, NULL, 'D', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '3-5', 5, 'mcq', 'Hana deposited a fixed amount into her bank account each month. The function $f(t) = 100 + 25t$ gives the amount, in dollars, in Hana''s bank account after $t$ monthly deposits.', NULL, 'What is the best interpretation of 25 in this context?', '{"A":"With each monthly deposit, the amount in Hana''s bank account increased by $25.","B":"Before Hana made any monthly deposits, the amount in her bank account was $25.","C":"After 1 monthly deposit, the amount in Hana''s bank account was $25.","D":"Hana made a total of 25 monthly deposits."}'::jsonb, NULL, 'A', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '3-6', 6, 'grid', NULL, NULL, 'A customer spent $27 to purchase oranges at $3 per pound. How many pounds of oranges did the customer purchase?', NULL, NULL, '9', '["9"]'::jsonb, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '3-7', 7, 'grid', NULL, NULL, 'Nasir bought 9 storage bins that were each the same price. He used a coupon for $63 off the entire purchase. The cost for the entire purchase after using the coupon was $27. What was the original price, in dollars, for 1 storage bin?', NULL, NULL, '10', '["10"]'::jsonb, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '3-8', 8, 'mcq', 'The table shows three values of $x$ and their corresponding values of $f(x)$ for the linear function $f$: when $x = 0$, $f(x) = 29$; when $x = 1$, $f(x) = 32$; when $x = 2$, $f(x) = 35$.', NULL, 'For the linear function $f$, the table shows three values of $x$ and their corresponding values of $f(x)$. Which equation defines $f(x)$?', '{"A":"$f(x) = 3x + 29$","B":"$f(x) = 29x + 32$","C":"$f(x) = 35x + 29$","D":"$f(x) = 32x + 35$"}'::jsonb, NULL, 'A', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '3-9', 9, 'mcq', '(Figure: Two right triangles are shown. The larger triangle is labeled with vertices P (bottom left), Q (top), and R (bottom right), with the right angle at R. The smaller similar triangle is labeled with vertices S, T, and U. Note: Figures not drawn to scale.)', 'Two right triangles are shown. The larger triangle is labeled with vertices P (bottom left), Q (top), and R (bottom right), with the right angle at R. The smaller similar triangle is labeled with vertices S, T, and U. Note: Figures not drawn to scale.', 'Right triangles $PQR$ and $STU$ are similar, where $P$ corresponds to $S$. If the measure of angle $Q$ is $18°$, what is the measure of angle $S$?', '{"A":"$18°$","B":"$72°$","C":"$82°$","D":"$162°$"}'::jsonb, NULL, 'B', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '3-10', 10, 'mcq', 'The scatterplot shows the relationship between two variables, $x$ and $y$.

(Figure: A scatterplot with horizontal axis $x$ and vertical axis $y$, both gridded from 1 to 10. Plotted data points show a positive linear association, with $y$ increasing as $x$ increases.)', 'A scatterplot with horizontal axis $x$ and vertical axis $y$, both gridded from 1 to 10. Plotted data points show a positive linear association, with $y$ increasing as $x$ increases.', 'Which of the following equations is the most appropriate linear model for the data shown?', '{"A":"$y = 0.9 + 9.4x$","B":"$y = 0.9 - 9.4x$","C":"$y = 9.4 + 0.9x$","D":"$y = 9.4 - 0.9x$"}'::jsonb, NULL, 'D', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '3-11', 11, 'mcq', '$2.5b + 5r = 80$', NULL, 'The given equation describes the relationship between the number of birds, $b$, and the number of reptiles, $r$, that can be cared for at a pet care business on a given day. If the business cares for 16 reptiles on a given day, how many birds can it care for on this day?', '{"A":"0","B":"5","C":"40","D":"80"}'::jsonb, NULL, 'A', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '3-12', 12, 'mcq', '(Figure: The xy-plane shows a straight line on a grid with both axes labeled from about -10 to 16. The line slopes downward from left to right (negative slope), crossing the y-axis at -8.)', 'The xy-plane shows a straight line on a grid with both axes labeled from about -10 to 16. The line slopes downward from left to right (negative slope), crossing the y-axis at -8.', 'What is an equation of the graph shown?', '{"A":"$y = -2x - 8$","B":"$y = x - 8$","C":"$y = -x - 8$","D":"$y = 2x - 8$"}'::jsonb, NULL, 'C', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '3-13', 13, 'grid', NULL, NULL, 'If $\dfrac{x}{8} = 5$, what is the value of $\dfrac{8}{x}$?', NULL, NULL, '1/5', '["1/5",".2"]'::jsonb, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '3-14', 14, 'grid', '$24x + y = 48$
$6x + y = 72$', NULL, 'The solution to the given system of equations is $(x, y)$. What is the value of $y$?', NULL, NULL, '80', '["80"]'::jsonb, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '3-15', 15, 'mcq', NULL, NULL, 'Line $t$ in the xy-plane has a slope of $-\dfrac{1}{3}$ and passes through the point $(9, 10)$. Which equation defines line $t$?', '{"A":"$y = 13x - \\dfrac{1}{3}$","B":"$y = 9x + 10$","C":"$y = -\\dfrac{x}{3} + 10$","D":"$y = -\\dfrac{x}{3} + 13$"}'::jsonb, NULL, 'D', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '3-16', 16, 'mcq', 'The function $f(x) = 206(1.034)^x$ models the value, in dollars, of a certain bank account by the end of each year from 1957 through 1972, where $x$ is the number of years after 1957.', NULL, 'Which of the following is the best interpretation of “$f(5)$ is approximately equal to 243” in this context?', '{"A":"The value of the bank account is estimated to be approximately 5 dollars greater in 1962 than in 1957.","B":"The value of the bank account is estimated to be approximately 243 dollars in 1962.","C":"The value, in dollars, of the bank account is estimated to be approximately 5 times greater in 1962 than in 1957.","D":"The value of the bank account is estimated to increase by approximately 243 dollars every 5 years between 1957 and 1972."}'::jsonb, NULL, 'B', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '3-17', 17, 'mcq', NULL, NULL, 'For a certain rectangular region, the ratio of its length to its width is 35 to 10. If the width of the rectangular region increases by 7 units, how must the length change to maintain this ratio?', '{"A":"It must decrease by 24.5 units.","B":"It must increase by 24.5 units.","C":"It must decrease by 7 units.","D":"It must increase by 7 units."}'::jsonb, NULL, 'B', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '3-18', 18, 'mcq', NULL, NULL, 'Square $P$ has a side length of $x$ inches. Square $Q$ has a perimeter that is 176 inches greater than the perimeter of square $P$. The function $f$ gives the area of square $Q$, in square inches. Which of the following defines $f$?', '{"A":"$f(x) = (x + 44)^2$","B":"$f(x) = (x + 176)^2$","C":"$f(x) = (176x + 44)^2$","D":"$f(x) = (176x + 176)^2$"}'::jsonb, NULL, 'A', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '3-19', 19, 'mcq', '$\dfrac{14x}{7y} = 2\sqrt{w + 19}$', NULL, 'The given equation relates the distinct positive real numbers $w$, $x$, and $y$. Which equation correctly expresses $w$ in terms of $x$ and $y$?', '{"A":"$w = \\sqrt{\\dfrac{x}{y}} - 19$","B":"$w = \\sqrt{\\dfrac{28x}{14y}} - 19$","C":"$w = \\left(\\dfrac{x}{y}\\right)^2 - 19$","D":"$w = \\left(\\dfrac{28x}{14y}\\right)^2 - 19$"}'::jsonb, NULL, 'C', NULL, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '3-20', 20, 'grid', NULL, NULL, 'Point $O$ is the center of a circle. The measure of arc $RS$ on this circle is $100°$. What is the measure, in degrees, of its associated angle $ROS$?', NULL, NULL, '100', '["100"]'::jsonb, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '3-21', 21, 'grid', NULL, NULL, 'The expression $6\sqrt[5]{3^5 x^{45}} \cdot \sqrt[8]{2^8 x}$ is equivalent to $ax^b$, where $a$ and $b$ are positive constants and $x > 1$. What is the value of $a + b$?', NULL, NULL, '361/8', '["361/8","45.12","45.13"]'::jsonb, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '3-22', 22, 'mcq', NULL, NULL, 'A right triangle has sides of length $2\sqrt{2}$, $6\sqrt{2}$, and $\sqrt{80}$ units. What is the area of the triangle, in square units?', '{"A":"$8\\sqrt{2} + \\sqrt{80}$","B":"$12$","C":"$24\\sqrt{80}$","D":"$24$"}'::jsonb, NULL, 'B', NULL, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '3-23', 23, 'mcq', NULL, NULL, 'The expression $4x^2 + bx - 45$, where $b$ is a constant, can be rewritten as $(hx + k)(x + j)$, where $h$, $k$, and $j$ are integer constants. Which of the following must be an integer?', '{"A":"$\\dfrac{b}{h}$","B":"$\\dfrac{b}{k}$","C":"$\\dfrac{45}{h}$","D":"$\\dfrac{45}{k}$"}'::jsonb, NULL, 'D', NULL, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '3-24', 24, 'mcq', '$y = 2x^2 - 21x + 64$
$y = 3x + a$', NULL, 'In the given system of equations, $a$ is a constant. The graphs of the equations in the given system intersect at exactly one point, $(x, y)$, in the xy-plane. What is the value of $x$?', '{"A":"$-8$","B":"$-6$","C":"$6$","D":"$8$"}'::jsonb, NULL, 'C', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '3-25', 25, 'mcq', NULL, NULL, 'An isosceles right triangle has a hypotenuse of length 58 inches. What is the perimeter, in inches, of this triangle?', '{"A":"$29\\sqrt{2}$","B":"$58\\sqrt{2}$","C":"$58 + 58\\sqrt{2}$","D":"$58 + 116\\sqrt{2}$"}'::jsonb, NULL, 'C', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '3-26', 26, 'mcq', NULL, NULL, 'In the xy-plane, a parabola has vertex $(9, -14)$ and intersects the x-axis at two points. If the equation of the parabola is written in the form $y = ax^2 + bx + c$, where $a$, $b$, and $c$ are constants, which of the following could be the value of $a + b + c$?', '{"A":"$-23$","B":"$-19$","C":"$-14$","D":"$-12$"}'::jsonb, NULL, 'D', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '3-27', 27, 'grid', NULL, NULL, 'Function $f$ is defined by $f(x) = -a^x + b$, where $a$ and $b$ are constants. In the xy-plane, the graph of $y = f(x) - 15$ has a y-intercept at $\left(0, -\dfrac{99}{7}\right)$. The product of $a$ and $b$ is $\dfrac{65}{7}$. What is the value of $a$?', NULL, NULL, '5', '["5"]'::jsonb, NULL, 39)
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
  VALUES (v_mod, 1, '4-1', 1, 'mcq', 'The line graph shows the estimated number of chipmunks in a state park on April 1 of each year from 1989 to 1999.

(Figure: A line graph titled with x-axis labeled "Year" showing years 1989 through 1999, and y-axis labeled "Estimated number of chipmunks" ranging from 0 to 200 in increments of 50. The plotted line: starts near 40 in 1989, stays near 40 in 1990, rises to about 100 in 1991, stays at about 100 in 1992, drops to about 50 in 1993, peaks at about 160 in 1994, drops to about 50 in 1995, rises to about 100 in 1996, stays near 100 in 1997, drops to about 50 in 1998, and rises to about 110 in 1999.)', 'A line graph titled with x-axis labeled "Year" showing years 1989 through 1999, and y-axis labeled "Estimated number of chipmunks" ranging from 0 to 200 in increments of 50. The plotted line: starts near 40 in 1989, stays near 40 in 1990, rises to about 100 in 1991, stays at about 100 in 1992, drops to about 50 in 1993, peaks at about 160 in 1994, drops to about 50 in 1995, rises to about 100 in 1996, stays near 100 in 1997, drops to about 50 in 1998, and rises to about 110 in 1999.', 'Based on the line graph, in which year was the estimated number of chipmunks in the state park the greatest?', '{"A":"1989","B":"1994","C":"1995","D":"1998"}'::jsonb, NULL, 'B', NULL, NULL, 42)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '4-2', 2, 'mcq', NULL, NULL, 'A fish swam a distance of 5,104 yards. How far did the fish swim, in miles? (1 mile = 1,760 yards)', '{"A":"0.3","B":"2.9","C":"3,344","D":"6,864"}'::jsonb, NULL, 'B', NULL, NULL, 42)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '4-3', 3, 'mcq', NULL, NULL, 'Which expression is equivalent to $12x^3 - 5x^3$ ?', '{"A":"$7x^6$","B":"$17x^3$","C":"$7x^3$","D":"$17x^6$"}'::jsonb, NULL, 'C', NULL, NULL, 42)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '4-4', 4, 'mcq', '$x + y = 18$
$5y = x$', NULL, 'What is the solution $(x, y)$ to the given system of equations?', '{"A":"$(15, 3)$","B":"$(16, 2)$","C":"$(17, 1)$","D":"$(18, 0)$"}'::jsonb, NULL, 'A', NULL, NULL, 42)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '4-5', 5, 'mcq', NULL, NULL, 'The point $(8, 2)$ in the $xy$-plane is a solution to which of the following systems of inequalities?', '{"A":"$x > 0$, $y > 0$","B":"$x > 0$, $y < 0$","C":"$x < 0$, $y > 0$","D":"$x < 0$, $y < 0$"}'::jsonb, NULL, 'A', NULL, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '4-6', 6, 'grid', '$|x - 5| = 10$', NULL, 'What is one possible solution to the given equation?', NULL, NULL, '15', '["15","-5"]'::jsonb, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '4-7', 7, 'grid', '$f(x) = 7x + 1$', NULL, 'The function gives the total number of people on a company retreat with $x$ managers. What is the total number of people on a company retreat with 7 managers?', NULL, NULL, '50', '["50"]'::jsonb, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '4-8', 8, 'mcq', '$h(x) = x^2 - 3$', NULL, 'Which table gives three values of $x$ and their corresponding values of $h(x)$ for the given function $h$?', '{"A":"x: 1, 2, 3; h(x): 4, 5, 6","B":"x: 1, 2, 3; h(x): -2, 1, 6","C":"x: 1, 2, 3; h(x): -1, 1, 3","D":"x: 1, 2, 3; h(x): -2, 1, 3"}'::jsonb, NULL, 'B', NULL, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '4-9', 9, 'mcq', NULL, NULL, 'The function $f$ is defined by $f(x) = 270(0.1)^x$. What is the value of $f(0)$ ?', '{"A":"0","B":"1","C":"27","D":"270"}'::jsonb, NULL, 'D', NULL, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '4-10', 10, 'mcq', NULL, NULL, 'To estimate the proportion of a population that has a certain characteristic, a random sample was selected from the population. Based on the sample, it is estimated that the proportion of the population that has the characteristic is 0.49, with an associated margin of error of 0.04. Based on this estimate and margin of error, which of the following is the most appropriate conclusion about the proportion of the population that has the characteristic?', '{"A":"It is plausible that the proportion is between 0.45 and 0.53.","B":"It is plausible that the proportion is less than 0.45.","C":"The proportion is exactly 0.49.","D":"It is plausible that the proportion is greater than 0.53."}'::jsonb, NULL, 'A', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '4-11', 11, 'mcq', NULL, NULL, 'A moving truck can tow a trailer if the combined weight of the trailer and the boxes it contains is no more than 4,600 pounds. What is the maximum number of boxes this truck can tow in a trailer with a weight of 500 pounds if each box weighs 120 pounds?', '{"A":"34","B":"35","C":"38","D":"39"}'::jsonb, NULL, 'A', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '4-12', 12, 'mcq', '$-4x^2 - 7x = -36$', NULL, 'What is the positive solution to the given equation?', '{"A":"$\\frac{7}{4}$","B":"$\\frac{9}{4}$","C":"4","D":"7"}'::jsonb, NULL, 'B', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '4-13', 13, 'grid', 'The table summarizes the distribution of color and shape for 100 tiles of equal area. The table has columns Red, Blue, Yellow, and Total, and rows Square, Pentagon, and Total. Square: Red 10, Blue 20, Yellow 25, Total 55. Pentagon: Red 20, Blue 10, Yellow 15, Total 45. Total: Red 30, Blue 30, Yellow 40, Total 100.', NULL, 'If one of these tiles is selected at random, what is the probability of selecting a red tile? (Express your answer as a decimal or fraction, not as a percent.)', NULL, NULL, '.3', '[".3","3/10"]'::jsonb, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '4-14', 14, 'grid', '$f(x) = 2x + 3$', NULL, 'For the given function $f$, the graph of $y = f(x)$ in the $xy$-plane is parallel to line $j$. What is the slope of line $j$ ?', NULL, NULL, '2', '["2"]'::jsonb, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '4-15', 15, 'mcq', NULL, NULL, 'A proposal for a new library was included on an election ballot. A radio show stated that 3 times as many people voted in favor of the proposal as people who voted against it. A social media post reported that 15,000 more people voted in favor of the proposal than voted against it. Based on these data, how many people voted against the proposal?', '{"A":"7,500","B":"15,000","C":"22,500","D":"45,000"}'::jsonb, NULL, 'A', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '4-16', 16, 'mcq', '(Figure: A transversal line labeled t crosses two parallel horizontal lines, the upper labeled m and the lower labeled n. At the intersection of t with line m, an angle x degrees is marked above the line and an angle y degrees is marked below the line (adjacent angles). At the intersection of t with line n, an angle z degrees is marked. Note: Figure not drawn to scale.)', 'A transversal line labeled t crosses two parallel horizontal lines, the upper labeled m and the lower labeled n. At the intersection of t with line m, an angle x degrees is marked above the line and an angle y degrees is marked below the line (adjacent angles). At the intersection of t with line n, an angle z degrees is marked. Note: Figure not drawn to scale.', 'In the figure, lines $m$ and $n$ are parallel. If $x = 6k + 13$ and $y = 8k - 29$, what is the value of $z$ ?', '{"A":"3","B":"21","C":"41","D":"139"}'::jsonb, NULL, 'C', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '4-17', 17, 'mcq', '$-3x + 21px = 84$', NULL, 'In the given equation, $p$ is a constant. The equation has no solution. What is the value of $p$ ?', '{"A":"0","B":"$\\frac{1}{7}$","C":"$\\frac{4}{3}$","D":"4"}'::jsonb, NULL, 'B', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '4-18', 18, 'mcq', '$f(x) = (x - 10)(x + 13)$', NULL, 'The function $f$ is defined by the given equation. For what value of $x$ does $f(x)$ reach its minimum?', '{"A":"$-130$","B":"$-13$","C":"$-\\frac{23}{2}$","D":"$-\\frac{3}{2}$"}'::jsonb, NULL, 'D', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '4-19', 19, 'mcq', NULL, NULL, 'The function $f(x) = \frac{1}{9}(x - 7)^2 + 3$ gives a metal ball''s height above the ground $f(x)$, in inches, $x$ seconds after it started moving on a track, where $0 \le x \le 10$. Which of the following is the best interpretation of the vertex of the graph of $y = f(x)$ in the $xy$-plane?', '{"A":"The metal ball''s minimum height was 3 inches above the ground.","B":"The metal ball''s minimum height was 7 inches above the ground.","C":"The metal ball''s height was 3 inches above the ground when it started moving.","D":"The metal ball''s height was 7 inches above the ground when it started moving."}'::jsonb, NULL, 'A', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '4-20', 20, 'grid', NULL, NULL, 'In triangle $JKL$, $\cos(K) = \frac{24}{51}$ and angle $J$ is a right angle. What is the value of $\cos(L)$ ?', NULL, NULL, '15/17', '["15/17",".8824",".8823"]'::jsonb, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '4-21', 21, 'grid', '$-x^2 + bx - 676 = 0$', NULL, 'In the given equation, $b$ is a positive integer. The equation has no real solution. What is the greatest possible value of $b$ ?', NULL, NULL, '51', '["51"]'::jsonb, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '4-22', 22, 'mcq', 'A system of equations is shown by two lines graphed in the xy-plane.

(Figure: A coordinate grid in the xy-plane with both axes ranging from about -10 to 10. Two straight lines are graphed, representing a system of two linear equations that intersect at a single point.)', 'A coordinate grid in the xy-plane with both axes ranging from about -10 to 10. Two straight lines are graphed, representing a system of two linear equations that intersect at a single point.', 'If a new graph of three linear equations is created using the system of equations shown and the equation $x + 4y = -16$, how many solutions $(x, y)$ will the resulting system of three equations have?', '{"A":"Zero","B":"Exactly one","C":"Exactly two","D":"Infinitely many"}'::jsonb, NULL, 'A', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '4-23', 23, 'mcq', '$f(x) = 5{,}470(0.64)^{\frac{x}{12}}$', NULL, 'The function $f$ gives the value, in dollars, of a certain piece of equipment after $x$ months of use. If the value of the equipment decreases each year by $p\%$ of its value the preceding year, what is the value of $p$ ?', '{"A":"4","B":"5","C":"36","D":"64"}'::jsonb, NULL, 'C', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '4-24', 24, 'mcq', 'The dot plot, titled "Data Set A," represents the 15 values in data set A along a number line marked 22, 23, 24, 25, 26.

(Figure: A dot plot titled "Data Set A" over a number line labeled 22, 23, 24, 25, 26. Dots are stacked above the values to represent the 15 data points in data set A.)', 'A dot plot titled "Data Set A" over a number line labeled 22, 23, 24, 25, 26. Dots are stacked above the values to represent the 15 data points in data set A.', 'The dot plot represents the 15 values in data set A. Data set B is created by adding 56 to each of the values in data set A. Which of the following correctly compares the medians and the ranges of data sets A and B?', '{"A":"The median of data set B is equal to the median of data set A, and the range of data set B is equal to the range of data set A.","B":"The median of data set B is equal to the median of data set A, and the range of data set B is greater than the range of data set A.","C":"The median of data set B is greater than the median of data set A, and the range of data set B is equal to the range of data set A.","D":"The median of data set B is greater than the median of data set A, and the range of data set B is greater than the range of data set A."}'::jsonb, NULL, 'C', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '4-25', 25, 'mcq', NULL, NULL, 'The equation $x^2 + (y - 1)^2 = 49$ represents circle A. Circle B is obtained by shifting circle A down 2 units in the $xy$-plane. Which of the following equations represents circle B?', '{"A":"$(x - 2)^2 + (y - 1)^2 = 49$","B":"$x^2 + (y - 3)^2 = 49$","C":"$(x + 2)^2 + (y - 1)^2 = 49$","D":"$x^2 + (y + 1)^2 = 49$"}'::jsonb, NULL, 'D', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '4-26', 26, 'mcq', NULL, NULL, 'Two identical rectangular prisms each have a height of 90 centimeters (cm). The base of each prism is a square, and the surface area of each prism is $K$ cm$^2$. If the prisms are glued together along a square base, the resulting prism has a surface area of $\frac{92}{47}K$ cm$^2$. What is the side length, in cm, of each square base?', '{"A":"4","B":"8","C":"9","D":"16"}'::jsonb, NULL, 'B', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '4-27', 27, 'grid', NULL, NULL, '210 is $p\%$ greater than 30. What is the value of $p$ ?', NULL, NULL, '600', '["600"]'::jsonb, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
END $seed$;
