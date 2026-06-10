-- =============================================================================
-- Migration: 0169_seed_cb_og_6.sql
-- Purpose:   Seed "CB OG #6" (College Board linear Digital SAT practice test,
--            66 RW + 54 Math = 120 Q) into the full-test tables from 0048.
--   Source:  sat-practice-test-6-digital.pdf; official College Board answer key (pdf/Key/).
--   Idempotent upsert on (slug)/(test_id,position)/(module_id,position).
-- =============================================================================
DO $seed$
DECLARE v_test uuid; v_mod uuid;
BEGIN
  INSERT INTO public.tests (slug, ordinal, title, short_title, source, total_questions)
  VALUES ('cb-og-6', 12, 'CB OG #6', 'CB OG #6', 'sat-practice-test-6-digital.pdf', 120)
  ON CONFLICT (slug) DO UPDATE SET ordinal=EXCLUDED.ordinal, title=EXCLUDED.title,
    short_title=EXCLUDED.short_title, source=EXCLUDED.source, total_questions=EXCLUDED.total_questions
  RETURNING id INTO v_test;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 1, 'reading-writing', 'Reading and Writing — Module 1', 1920, 33)
  ON CONFLICT (test_id, position) DO UPDATE SET section=EXCLUDED.section, label=EXCLUDED.label,
    time_limit_seconds=EXCLUDED.time_limit_seconds, question_count=EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '1-1', 1, 'mcq', 'Though not closely related, the hedgehog tenrecs of Madagascar share basic ______ true hedgehogs, including protective spines, pointed snouts, and small body size—traits the two groups of mammals independently developed in response to equivalent roles in their respective habitats.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"examples of","B":"concerns about","C":"indications of","D":"similarities with"}'::jsonb, NULL, 'D', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '1-2', 2, 'mcq', 'In editor Lisa Yaszek''s introduction to her anthology The Future Is Female! More Classic Science Fiction Stories by Women, Yaszek identifies an increasing sense of ______ feminist mode of writing in the 1970s, in contrast to many woman-authored science fiction stories of the 1920s to 1960s whose politics were less deliberately signaled.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"a prudently","B":"an overtly","C":"a cordially","D":"an inadvertently"}'::jsonb, NULL, 'B', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '1-3', 3, 'mcq', '______ the long-standing trend of overemphasizing teenagers and young adults in research on social media use, scholars have recently begun to expand their focus to include the fastest-growing cohort of social media users: senior citizens.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"Exacerbating","B":"Redressing","C":"Epitomizing","D":"Precluding"}'::jsonb, NULL, 'B', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '1-4', 4, 'mcq', 'The following text is adapted from James Baldwin''s 1956 novel Giovanni''s Room. The narrator is riding in a taxi down a street lined with food vendors and shoppers in Paris, France.

The multitude of Paris seems to be dressed in blue every day but Sunday, when, for the most part, they put on an unbelievably festive black. Here they were now, in blue, disputing, every inch, our passage, with their wagons, handtrucks, their bursting baskets carried at an angle steeply self-confident on the back.', NULL, 'As used in the text, what does the word "disputing" most nearly mean?', '{"A":"Arguing about","B":"Disapproving of","C":"Asserting possession of","D":"Providing resistance to"}'::jsonb, NULL, 'D', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '1-5', 5, 'mcq', 'While recent scholarship has undermined claims that the works of twelfth-century Islamic philosopher Ibn Rushd were ______ other Muslim philosophers of his time, it is indisputable that his location in the Muslim-ruled area of what is now Spain meant that his works were primarily available thousands of miles west of the era''s center of Islamic thought.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"controversial among","B":"antagonistic toward","C":"imitated by","D":"inconsequential to"}'::jsonb, NULL, 'D', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '1-6', 6, 'mcq', 'On painter William H. Johnson''s return to the United States in 1938 after a decade in Europe, his style underwent an abrupt transformation. Turning away from landscapes painted in an expressionist style—a style that often involves using fluid, distorted shapes and thick, textured brushstrokes to express the artist''s subjective experience of reality—Johnson began painting portraits of Black Americans in a bold new way. Evocative of African sculpture and American and Scandinavian folk art, these portraits feature flat, deliberately oversimplified figures in a vibrant but limited color palette.', NULL, 'Which choice best describes the function of the underlined sentence in the text as a whole?', '{"A":"It elaborates on the previous sentence''s statement about a transitional moment in Johnson''s artistic career.","B":"It provides information about Johnson''s travels in support of a claim about his artistic influences, which is advanced in the following sentence.","C":"It recounts a moment in Johnson''s personal life that enabled the success of his subsequent career, which is summarized in the following sentence.","D":"It presents evidence that calls into question the previous sentence''s characterization of Johnson''s artistic development."}'::jsonb, NULL, 'A', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '1-7', 7, 'mcq', 'When classical pianist Martha Argerich performs, it appears as if the music is coming to her spontaneously. She''s highly skilled technically, but because of how freely she plays and her willingness to take risks, she seems relaxed and natural. Her apparent ease, however, is due to a tremendous amount of preparation. Despite Argerich''s experience and virtuosity, she never takes for granted that she knows a piece of music. Instead, she approaches the music as if encountering it for the first time and tries to understand it anew.', NULL, 'Which choice best states the main purpose of the text?', '{"A":"To provide details about how Argerich identifies which pieces of music she will perform","B":"To assert that Argerich''s performances look effortless because of how she prepares for them","C":"To discuss the kinds of music Argerich feels most comfortable encountering for the first time","D":"To describe the unique way that Argerich approaches music she hasn''t performed before"}'::jsonb, NULL, 'B', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '1-8', 8, 'mcq', 'The following text is adapted from Herman Melville''s 1855 novel Israel Potter. Israel is a young man wandering through New England during the late eighteenth century.

He hired himself out for three months; at the end of that time to receive for his wages two hundred acres of land lying in New Hampshire. [...] His employer proving false to the contract in the matter of the land, and there being no law in the country to force him to fulfil it, Israel—who, however brave-hearted, and even much of a dare-devil upon a pinch, seems nevertheless to have evinced, throughout many parts of his career, a singular patience and mildness—was obliged to look round for other means of livelihood than clearing out a farm for himself in the wilderness.', NULL, 'Which choice best describes the function of the underlined portion in the text as a whole?', '{"A":"It implies that Israel treasures a particular characteristic of his personality when that characteristic should usually be regarded as a flaw.","B":"It suggests that if not for a certain aspect of his character, Israel might not have been as easily thwarted in his ambition to establish a farm.","C":"It shows why Israel would not have been able to undertake the enormous amount of labor necessary to run a farm even if he had owned the necessary property.","D":"It explains why, when the situation requires it, Israel is able to undertake courageous acts that others would generally avoid."}'::jsonb, NULL, 'B', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '1-9', 9, 'mcq', 'Text 1
In 1954 George Balanchine choreographed a production of The Nutcracker, a ballet by Pyotr Ilyich Tchaikovsky. It has since become a tradition for hundreds of dance companies in North America to stage The Nutcracker each year. But the show is stuck in the past, with an old-fashioned story and references, so it should no longer be produced. Ballet needs to create new traditions if it wants to stay relevant to contemporary audiences.

Text 2
The Nutcracker is outdated, but it should be kept because it''s a holiday favorite and provides substantial income for some dance companies. Although it can be behind the times, there are creative ways to update the show. For example, Debbie Allen successfully modernized the story. Her show Hot Chocolate Nutcracker combines ballet, tap, hip-hop, and other styles, and it has been gaining in popularity since it opened in 2009.', NULL, 'Based on the texts, how would the author of Text 2 most likely respond to the underlined claim in Text 1?', '{"A":"By questioning the idea that the story of The Nutcracker is stuck in the past and by rejecting the suggestion that contemporary audiences would enjoy an updated version","B":"By agreeing that contemporary audiences have largely stopped going to see performances of The Nutcracker because it''s so old-fashioned","C":"By pointing out that most dance companies could increase their incomes by offering modernized versions of The Nutcracker","D":"By suggesting that dance companies should consider offering revised versions of The Nutcracker instead of completely rejecting the show"}'::jsonb, NULL, 'D', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '1-10', 10, 'mcq', 'To understand how Paleolithic artists navigated dark caves, archaeologist María Ángeles Medina-Alcaide and her team tested different lighting methods in a cave in Spain using replicas of artifacts found in European caves with art. They used three different Paleolithic light sources—torches, animal-fat lamps, and fireplaces—determining that each likely had a specific purpose. For instance, the team learned that the animal-fat lamps were less useful than torches while walking because the lamps didn''t illuminate the cave floor.', NULL, 'Which choice best states the main idea of the text?', '{"A":"Medina-Alcaide and her team''s study demonstrated that fireplaces were essential to the creators of Paleolithic cave art.","B":"Medina-Alcaide and her team discovered that Paleolithic cave artists in Spain used animal-fat lamps more often than they used torches.","C":"Medina-Alcaide and her team were reluctant to draw many conclusions from their study because of the difficulty they had replicating light sources based on known artifacts.","D":"Medina-Alcaide and her team tested Paleolithic light sources and learned some details about how Paleolithic artists traveled within dark caves."}'::jsonb, NULL, 'D', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '1-11', 11, 'mcq', 'Annual Car Production in the United States, 1910–1925
Year | Number of cars produced | Number of companies producing cars
1910 | 123,990 | 320
1915 | 548,139 | 224
1920 | 1,651,625 | 197
1925 | 3,185,881 | 80

A student is using the table as part of a social studies class presentation on the US auto industry in the early twentieth century. The student notes that, according to the table, from 1910 to 1925 ______', NULL, 'Which choice most effectively uses data from the table to complete the statement?', '{"A":"the number of cars produced increased but the number of companies producing cars decreased.","B":"both the number of cars produced and the number of companies producing cars remained unchanged.","C":"the number of cars produced decreased but the number of companies producing cars remained unchanged.","D":"both the number of cars produced and the number of companies producing cars increased."}'::jsonb, NULL, 'A', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '1-12', 12, 'mcq', 'External shopping cues are a type of marketing that uses obvious messaging—a display featuring a new product, for example, or a "buy one, get one free" offer—to entice consumers to make spontaneous purchases. In a study, data scientist Sam K. Hui and colleagues found that this effect can also be achieved with a less obvious cue: rearranging a store''s layout. The researchers explain that trying to find items in new locations causes shoppers to move through more of the store, exposing them to more products and increasing the likelihood that they''ll buy an item they hadn''t planned on purchasing.', NULL, 'Which response from a survey given to shoppers who made a purchase at a retail store best supports the researchers'' explanation?', '{"A":"\"I needed to buy some cleaning supplies, but they weren''t in their regular place. While I was looking for them, I saw this interesting notebook and decided to buy it, too.\"","B":"\"I didn''t buy everything on my shopping list today. I couldn''t find a couple of the items in the store, even though I looked all over for them.\"","C":"\"The store sent me a coupon for a new brand of soup, so I came here to find out what kinds of soup that brand offers. I decided to buy a few cans because I had the coupon.\"","D":"\"This store is larger than one that''s closer to where I live, and it carries more products. I came here to buy some things that the other store doesn''t always have.\""}'::jsonb, NULL, 'A', NULL, NULL, 9)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '1-13', 13, 'mcq', 'The 2021 exhibition This Is the Day at Arkansas''s Crystal Bridges Museum of American Art featured works dealing with expressions of faith and spirituality in the Black community. The museum''s 2022 exhibition The Dirty South, meanwhile, focused on Black culture in the American South from 1920 to 2020, with a particular focus on the intersections between visual arts and music. Together, these exhibitions don''t merely highlight the diversity of the Black experience in the US; they also showcase the diverse media through which artists have depicted and engaged with that experience.', NULL, 'Which statement about the exhibitions, if true, would most directly support the underlined claim?', '{"A":"Between them, This Is the Day and The Dirty South included drawings, paintings, photographs, sculptures, textiles, videos, costumes, and music.","B":"This Is the Day included works by fewer than two dozen artists, whereas The Dirty South included works by more than 80 artists.","C":"This Is the Day exclusively included works in the permanent collection of the museum, whereas The Dirty South included works from multiple sources outside the museum.","D":"Between them, This Is the Day and The Dirty South included works depicting more than 300 years of Black experience in the United States."}'::jsonb, NULL, 'A', NULL, NULL, 9)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '1-14', 14, 'mcq', 'Mean Attentiveness Scores by Leave Time Condition
The graph plots mean test score (higher scores indicate greater attentiveness) on the y-axis (0 to 600) against test administration (first, second, third) on the x-axis, with three series: no leave, 2–4 days leave, and 1–5 weeks leave.

To investigate potential cognitive benefits of taking leave from work, psychologist Jan Packer and colleagues conducted a six-month study of Australian university staff members who took no leave from work during the study, took 2–4 days of leave, or took 1–5 weeks of leave. Tests of attentiveness were administered to participants three times during the study: at random for the no-leave staff, and for the rest, one week before their leave, one week following their return to work, and one week after the second test administration. After analyzing the results, the researchers concluded that longer leave times might not confer a greater cognitive benefit than shorter leave times do.

(Figure: Bar graph titled "Mean Attentiveness Scores by Leave Time Condition." Y-axis: Mean test score (higher scores indicate greater attentiveness), 0 to 600. X-axis: Test administration (first, second, third). Three series: no leave, 2–4 days leave, 1–5 weeks leave.)', 'Bar graph titled "Mean Attentiveness Scores by Leave Time Condition." Y-axis: Mean test score (higher scores indicate greater attentiveness), 0 to 600. X-axis: Test administration (first, second, third). Three series: no leave, 2–4 days leave, 1–5 weeks leave.', 'Which choice best describes data from the graph that support the researchers'' conclusion?', '{"A":"In the second test administration, participants who took 2–4 days of leave had higher average attentiveness scores than did those who took no leave, but in the third test administration, those who took no leave had higher average scores than those who took 1–5 weeks of leave.","B":"In the first test administration, participants who took 2–4 days of leave had lower average attentiveness scores than did those who took 1–5 weeks of leave and those who took no leave.","C":"In both the second and third test administrations, participants who took 2–4 days of leave had higher average attentiveness scores than did participants who took 1–5 weeks of leave.","D":"In the second and third test administrations, participants who took 2–4 days of leave had higher average attentiveness scores than did those who took no leave."}'::jsonb, NULL, 'C', NULL, NULL, 10)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '1-15', 15, 'mcq', 'Number of Lizard Species by Average Percent of Maximal Speed Used When Pursuing Prey or Escaping Predators
The graph plots number of lizard species (y-axis, 0 to 9) against percent of maximal speed (x-axis) for two series: escaping and pursuing.

It may seem that the optimal strategy for an animal pursuing prey or escaping predators is to move at maximal speed, but the energy expense of exploiting full speed capacity can disfavor such a strategy even in escape contexts, as evidenced by the fact that ______

(Figure: Bar graph titled "Number of Lizard Species by Average Percent of Maximal Speed Used When Pursuing Prey or Escaping Predators." Y-axis: Number of lizard species (0 to 9). X-axis: Percent of maximal speed. Two series: escaping and pursuing.)', 'Bar graph titled "Number of Lizard Species by Average Percent of Maximal Speed Used When Pursuing Prey or Escaping Predators." Y-axis: Number of lizard species (0 to 9). X-axis: Percent of maximal speed. Two series: escaping and pursuing.', 'Which choice most effectively uses data from the graph to complete the text?', '{"A":"most lizard species use about the same percentage of their maximal speed when escaping predation as they do when pursuing prey.","B":"multiple lizard species move at an average of less than 90% of their maximal speed while escaping predation.","C":"more lizard species use, on average, 90%–100% of their maximal speed while escaping predation than use any other percentage of their maximal speed.","D":"at least 4 lizard species use, on average, less than 100% of their maximal speed while pursuing prey."}'::jsonb, NULL, 'B', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '1-16', 16, 'mcq', 'Under normal atmospheric pressure at Earth''s surface, water molecules form a tetrahedral network stabilized by hydrogen bonds between adjacent molecules. Extreme high pressure, such as can be found in deep ocean waters, destabilizes these bonds and compresses water''s structure, allowing water molecules within organisms to permeate proteins and impede crucial biological functions; yet deep-sea organisms known as piezophiles have adapted to extreme pressure. Studies have found a positive correlation between the depths that various piezophiles inhabit and concentrations of a compound called trimethylamine N-oxide (TMAO) in their muscle tissues, which has led a team of researchers to hypothesize that TMAO reduces water''s compressibility.', NULL, 'Which finding, if true, would most directly support the researchers'' hypothesis?', '{"A":"Water molecules are found to be impervious to TMAO even when the water molecules'' tetrahedral configuration has been distorted by high pressure.","B":"Examination of TMAO''s molecular structure shows that TMAO molecules retain their shape even as pressure increases.","C":"A positive correlation is found between concentrations of TMAO and the rate at which water''s molecular structure compresses as pressure increases.","D":"Analysis of water''s molecular structure under high pressure reveals that hydrogen bonds are more stable when TMAO is present than when it is not."}'::jsonb, NULL, 'D', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '1-17', 17, 'mcq', 'The Cretaceous pterosaur Tupandactylus navigans is known for having an anomalously oversized head crest. Until an almost complete fossil skeleton was found in Brazil, paleontologists had been able to study only skull specimens from T. navigans, though it was presumed that, like other pterosaurs, the species''s primary form of locomotion was powered flight. Examining the fuller skeleton in 2016, Victor Beccari and his team determined that T. navigans had long hind legs, short wings, and an unusually long neck—characteristics that, combined with the creature''s large-crested head, would have made sustained flight difficult and walking upright relatively comfortable. Based on these findings the team suggests that T. navigans likely ______', NULL, 'Which choice most logically completes the text?', '{"A":"flew for longer distances than did other pterosaur species that had oversized head crests.","B":"had longer wings than other pterosaur species considered to have been comfortable walking.","C":"had a smaller head than researchers expected based on the earlier T. navigans skull specimens.","D":"flew for shorter distances and spent more time walking than researchers previously thought."}'::jsonb, NULL, 'D', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '1-18', 18, 'mcq', 'Consumer psychologists have theorized that the likelihood that people who identify as ethical consumers—meaning that they strive to purchase goods and services with positive or neutral social and ecological effects—will purchase a given product positively correlates with their perception of that product''s effects. In a recent study of the attitudes of self-identified ethical consumers toward purchasing a specific mobile phone coming to market, researchers found that, on average, study participants in their twenties rated the phone''s social and ecological effects much less positively than did participants in other age groups. All other things being equal, if consumer psychologists'' theory is correct, this finding suggests that ______', NULL, 'Which choice most logically completes the text?', '{"A":"the phone is less appealing to ethical consumers in their twenties than other similar phones on the market are.","B":"ethical consumers in their twenties are less likely to purchase the phone than ethical consumers in other age groups are.","C":"there is not a meaningful difference in the likelihood of purchasing the phone among ethical consumers in different age groups.","D":"ethical consumers in their twenties are more likely than ethical consumers in other age groups to consider a phone''s social and ecological effects"}'::jsonb, NULL, 'B', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '1-19', 19, 'mcq', 'The Boston Saloon was one of the most popular African American–owned establishments in nineteenth-century Nevada. ______ by businessman William A.G. Brown, the saloon was known to offer elegant accommodations and an inclusive environment.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"Created","B":"Creates","C":"Creating","D":"Create"}'::jsonb, NULL, 'A', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '1-20', 20, 'mcq', 'Louise Bennett (1919–2006), also known as "Miss Lou," was an influential Jamaican poet and folklorist. Her innovative poems ______ the use of Jamaican Creole (a spoken language) in literature.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"popularized;","B":"popularized,","C":"popularized","D":"popularized:"}'::jsonb, NULL, 'C', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '1-21', 21, 'mcq', '"He was just the man for such a place, and it was just the place for such a man." This line is from Frederick Douglass''s autobiography Narrative of the Life of Frederick Douglass (1845). It''s an example of antimetabole, a writing technique that ______ emphasis by repeating a statement in a reversed order.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"create","B":"are creating","C":"have created","D":"creates"}'::jsonb, NULL, 'D', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '1-22', 22, 'mcq', 'Researchers Amit Kumar and Nicholas Epley investigated how ______ In a series of experiments conducted in 2022, they found that people performing small acts of kindness underestimated the positive effect their actions had on others.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"do people perceive acts of kindness.","B":"do people perceive acts of kindness?","C":"people perceive acts of kindness?","D":"people perceive acts of kindness."}'::jsonb, NULL, 'D', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '1-23', 23, 'mcq', 'In a painting titled "The Milkmaid" by Johannes Vermeer, the artist prominently features a bread basket, milk pitcher, and bowl. Such quotidian objects, depicted in exquisite detail by Vermeer, a painter celebrated for his naturalism, ______ the daily minutiae of a seventeenth-century Dutch household.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"was revealing","B":"has revealed","C":"reveals","D":"reveal"}'::jsonb, NULL, 'D', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '1-24', 24, 'mcq', 'Jamaican British artist Willard Wigan is known for his remarkable ______ so small that they are best viewed through a microscope, Wigan''s sculptures are made from tiny natural materials, such as spiderweb strands.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"microsculptures creations","B":"microsculptures, creations","C":"microsculptures. Creations","D":"microsculptures and creations"}'::jsonb, NULL, 'C', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '1-25', 25, 'mcq', 'Consider the mechanics of the pinhole camera: light passes through a small hole, resulting in a focused projected image. A ray diagram reveals how this ______ the hole''s small size restricts light to a single ray, all light passing through the hole can only arrive at a single destination, eliminating diffraction and ensuring a clear image.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"works because","B":"works. Because","C":"works, it''s because","D":"works: it''s because"}'::jsonb, NULL, 'B', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '1-26', 26, 'mcq', 'In the search for extraterrestrial life, astrobiologists Stuart Bartlett and Michael L. Wong propose that scientists avoid using the term "life." ______ researchers should use another word: "lyfe." This new term, they argue, could be used to draw distinctions between the known characteristics of life on Earth and the potentially differing characteristics of lyfe on other planets.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Previously,","B":"Regardless,","C":"There,","D":"Instead,"}'::jsonb, NULL, 'D', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '1-27', 27, 'mcq', 'Before it unveiled a massive new gallery in 2009, the Art Institute of Chicago was only able to display about 5% of its art collection. ______ the museum is able to display close to 30% of its collection.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Additionally,","B":"For example,","C":"Nevertheless,","D":"Today,"}'::jsonb, NULL, 'D', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 28, '1-28', 28, 'mcq', 'Working together with the Navajo Nation Department of Water Resources, Dr. Lani Tsinnajinnie analyzed data about snowpack levels in the Chuska Mountains. She found that the snowpack (the amount of snow on the ground) was deepest in early March at lower elevations. At higher elevations, ______ the snowpack was deepest in mid-March.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"in other words,","B":"for instance,","C":"on the other hand,","D":"in summary,"}'::jsonb, NULL, 'C', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 29, '1-29', 29, 'mcq', 'The Inca of South America used intricately knotted string devices called quipus to record countable information, like population data and payments. ______ they may have used quipus to record more complex information, like stories and myths, according to researchers.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"As a result,","B":"In other words,","C":"In addition,","D":"For example,"}'::jsonb, NULL, 'C', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 30, '1-30', 30, 'mcq', 'In hindsight, given the ideas about the natural world circulating among British scientists in the 1800s, the theory of natural selection was an obvious next step. It may not have been a coincidence, ______ that Charles Darwin and Alfred Wallace arrived at the concept independently. Indeed, contrary to the popular myth of the lone genius, theirs is not the first paradigm-shifting theory to have emerged from multiple scholars working in parallel.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"however,","B":"then,","C":"moreover,","D":"for example,"}'::jsonb, NULL, 'B', NULL, NULL, 16)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 31, '1-31', 31, 'mcq', 'While researching a topic, a student has taken the following notes:
• In the 1930s, the Imperial Sugar Cane Institute in India sought to limit the country''s dependence on imported sugarcane.
• The institute enlisted botanist Janaki Ammal to breed a local variety of sugarcane.
• She crossbred the imported sugarcane species Saccharum officinarum with grasses native to India.
• She succeeded in creating sugarcane hybrids well suited to India''s climate.

The student wants to emphasize Janaki Ammal''s achievement. Which choice most effectively uses relevant information from the notes to accomplish this goal?', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"By crossbreeding the imported sugarcane species Saccharum officinarum with grasses native to India, Ammal succeeded in creating sugarcane hybrids well suited to India''s climate.","B":"In the 1930s, the Imperial Sugar Cane Institute, which enlisted Ammal, sought to limit dependence on imported sugarcane.","C":"Ammal was enlisted by the Imperial Sugar Cane Institute at a time when a local variety of sugarcane needed to be produced.","D":"As part of efforts to breed a local variety of sugarcane, an imported sugarcane species called Saccharum officinarum was crossbred with grasses native to India."}'::jsonb, NULL, 'A', NULL, NULL, 16)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 32, '1-32', 32, 'mcq', 'While researching a topic, a student has taken the following notes:
• Elizabeth Catlett''s sculpture Recognition (1970) shows two African American figures with rounded, indistinct features.
• The figures reach out to each other in a pose that symbolizes a close, supportive relationship.
• Her sculpture Students Aspire (1978) shows two African American figures with sharply defined features.
• The figures hold an equal sign above their heads with one hand and embrace each other with the other hand.
• This pose symbolizes their support for each other in the pursuit of equality.

The student wants to emphasize a similarity between the two sculptures. Which choice most effectively uses relevant information from the notes to accomplish this goal?', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Catlett''s Students Aspire depicts two figures supporting each other in the pursuit of equality.","B":"Recognition and Students Aspire both show African American figures in poses that symbolize supportive relationships.","C":"Catlett completed Recognition in 1970 and Students Aspire in 1978.","D":"The figures in Recognition have features that are rounded and indistinct, while the figures in Students Aspire have sharply defined features."}'::jsonb, NULL, 'B', NULL, NULL, 17)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 33, '1-33', 33, 'mcq', 'While researching a topic, a student has taken the following notes:
• The ancient Arab dhow was a sailing vessel distinguishable by its triangular sails and stitched hull construction.
• Dhows were used primarily for trade along the coasts of Arab, South Asian, and East African countries.
• Contemporary shipbuilders in Oman use a mix of modern and traditional materials to build replicas of ancient dhows.
• Most of the materials used are traditional.
• Replica hulls are stitched together using the same traditional coconut palm fiber rope used on the hulls of ancient dhows.

The student wants to make a generalization about the materials used in dhow replicas. Which choice most effectively uses relevant information from the notes to accomplish this goal?', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"A traditional material that was used to stitch together the hulls of ancient dhows, coconut palm fiber rope is still used by shipbuilders.","B":"The ancient Arab dhow was a sailing vessel used primarily for trade and distinguishable by its triangular sails.","C":"Although most materials used in dhow replicas are traditional, some modern materials are used.","D":"Contemporary shipbuilders in Oman build replicas of the dhow, which was an ancient sailing vessel with a stitched hull construction."}'::jsonb, NULL, 'C', NULL, NULL, 17)
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
  VALUES (v_mod, 1, '2-1', 1, 'mcq', 'The works of Chicana artist Ester Hernandez are now ______ in museums both in the United States and abroad, but the murals she contributed to as a member of Las Mujeres Muralistas early in her artistic career were displayed in outdoor public spaces across San Francisco.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"invented","B":"adjusted","C":"featured","D":"recommended"}'::jsonb, NULL, 'C', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '2-2', 2, 'mcq', 'Whether Carmen Lomas Garza is creating small paintings and illustrations or large public artworks—such as Baile, a copper cutout of traditional Mexican dance in the San Francisco International Airport—she is ______ direct experience, drawing from memories of her childhood in Texas or details of her current surroundings in California.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"complimented by","B":"uncertain about","C":"unbothered by","D":"inspired by"}'::jsonb, NULL, 'D', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '2-3', 3, 'mcq', 'Animal researcher Amalia P.M. Bastos led a 2021 study about a wild kea parrot that used small stones as tools to preen its feathers. Skeptical colleagues had initially suggested to Bastos that the kea''s interactions with the stones might simply be ______ , but Bastos and her team showed that the kea was using the stones deliberately.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"intriguing","B":"obvious","C":"accidental","D":"observable"}'::jsonb, NULL, 'C', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '2-4', 4, 'mcq', 'In 1891, design artist William Morris cofounded the Kelmscott Press, which printed editions of books using preindustrial methods. Historians argue that Morris''s repudiation of industrialization is ______ the Kelmscott editions'' use of handmade materials and intricate ornamentation reminiscent of medieval manuscripts: these meticulously handcrafted elements exemplify the artistry involved.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"insensible to","B":"manifest in","C":"scrutinized by","D":"complicated by"}'::jsonb, NULL, 'B', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '2-5', 5, 'mcq', 'Mary Engle Pennington, a chemist who helped advance home refrigeration, undoubtedly made a substantial impact on society, but her place in our historical memory is perhaps more ______ than that of Stephanie Kwolek, who invented the incredibly strong material known as Kevlar, an accomplishment for which she will long be remembered.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"permanent","B":"tentative","C":"warranted","D":"prominent"}'::jsonb, NULL, 'B', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '2-6', 6, 'mcq', 'The following text is from Betty Smith''s 1943 novel A Tree Grows in Brooklyn. Francie, a young girl, visits the library often.

Francie thought that all the books in the world were in that library and she had a plan about reading all the books in the world. She was reading a book a day in alphabetical order and not skipping the dry ones. She remembered that the first author had been Abbott. She had been reading a book a day for a long time now and she was still in the B''s. Already she had read about bees and buffaloes, Bermuda vacations and Byzantine architecture. For all her enthusiasm, she had to admit that some of the B''s had been hard going. But Francie was a reader.', NULL, 'Which choice best states the main purpose of the text?', '{"A":"To illustrate Francie''s enjoyment of an unusual topic","B":"To explain why Francie prefers reading over other activities","C":"To portray Francie''s determination to meet a goal","D":"To describe a book that Francie greatly admires"}'::jsonb, NULL, 'C', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '2-7', 7, 'mcq', 'Researchers have long hypothesized that woolly mammoths were hunted to extinction in North America by humans using spears with grooved tips known as Clovis points. One anthropologist set out to test this hypothesis. Using a mechanical spear-thrower, he launched spears with Clovis points into mounds of clay—substitutes for the animals'' large bodies. The projectiles generally penetrated only a few inches into the clay, an amount insufficient to have harmed most woolly mammoths. This led the anthropologist to conclude that hunters using spears with Clovis points likely weren''t the principal drivers of the extinction.', NULL, 'Which choice best states the main purpose of the text?', '{"A":"To argue for the significance of new findings amid an ongoing debate among researchers","B":"To discuss the advantages and disadvantages of the method used in an experiment","C":"To summarize two competing hypotheses and a major finding associated with each one","D":"To describe an experiment whose results cast doubt on an established hypothesis"}'::jsonb, NULL, 'D', NULL, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '2-8', 8, 'mcq', 'The people of medieval Europe have traditionally been seen as uninterested in cleanliness and hygiene, but modern research has shown that this is largely a myth. According to historian Eleanor Janega, most medieval towns in Europe had at least one public bathhouse, which often offered both full-immersion baths and—more affordably—steam baths. While such amenities were available mainly to town dwellers, regular bathing in rivers and streams or daily sponge baths at home were common practices throughout medieval Europe.', NULL, 'Which choice best describes the function of the underlined portion?', '{"A":"It asserts that in medieval Europe steam baths were more popular in rural areas than in urban ones.","B":"It describes a limitation of earlier historians'' studies of medieval European bathing habits.","C":"It concedes that not all people in medieval Europe had access to public bathhouses.","D":"It explains why Janega decided to study the popularity of public bathhouses in medieval Europe."}'::jsonb, NULL, 'C', NULL, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '2-9', 9, 'mcq', 'Scholarly accounts of the Chicano movement—a movement that advocated for the social, political, and cultural empowerment of Mexican Americans and reached its zenith in the 1960s and 1970s—tend to focus on the most militant, outspoken figures in the movement, making it seem uniformly radical. Geographer Juan Herrera has shown, however, that if we shift our focus toward the way the movement manifested in comparatively low-profile neighborhood institutions and projects, we see participants espousing an array of political orientations and approaches to community activism.', NULL, 'Which choice best describes the function of the underlined portion in the text as a whole?', '{"A":"It presents a trend in scholarship on the Chicano movement that the text claims has been reevaluated by researchers in light of Herrera''s work on the movement''s participants.","B":"It identifies an aspect of the Chicano movement that the text implies was overemphasized by scholars due to their own political orientations.","C":"It describes a common approach to studying the Chicano movement that, according to the text, obscures the ideological diversity of the movement''s participants.","D":"It summarizes the conventional method for analyzing the Chicano movement, which the text suggests creates a misleading impression of the effectiveness of neighborhood institutions and projects."}'::jsonb, NULL, 'C', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '2-10', 10, 'mcq', 'Elizabeth Asiedu has identified a negative correlation between the share of developing countries'' economies derived from natural-resource extraction and those countries'' receipts of foreign investment. This may appear counterintuitive—resource extraction requires initial investments (in extractive technology, for instance) at scales best met by multinational corporations—but Asiedu notes that natural-resource industries'' boom-bust cycle can destabilize local currencies and increase developing countries'' vulnerability to external shocks, creating levels of uncertainty to which foreign investors are typically averse.', NULL, 'Which choice best states the main idea of the text?', '{"A":"Although it may seem surprising that foreign investment declines in developing countries as natural-resource extraction makes up a larger share of those countries'' economies, that decline happens because resource extraction requires initial investments too large for foreign investors to supply.","B":"Although developing countries tend to become less dependent on foreign investment as natural-resource industries make up a larger share of their economies, this change may not occur if the boom-bust cycle of those industries destabilizes local currencies or increases countries'' vulnerability to external shocks.","C":"Although one might expect that foreign investment would increase as natural-resource extraction makes up a larger share of developing countries'' economies, the opposite happens because heavy reliance on natural resources can lead to unattractive conditions for investors.","D":"Although foreign investors tend to avoid initial investments in natural-resource industries in developing countries, foreign investment may increase significantly as those industries stabilize and the risks associated with them decline."}'::jsonb, NULL, 'C', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '2-11', 11, 'mcq', 'To understand how temperature change affects microorganism-mediated cycling of soil nutrients in alpine ecosystems, Eva Kaštovská et al. collected plant-soil cores in the Tatra Mountains at elevations around 2,100 meters and transplanted them to elevations of 1,700–1,800 meters, where the mean air temperature was warmer by 2°C. Microorganism-mediated nutrient cycling was accelerated in the transplanted cores; crucially, microorganism community composition was unchanged, allowing Kaštovská et al. to attribute the acceleration to temperature-induced increases in microorganism activity.', NULL, 'It can most reasonably be inferred from the text that the finding about the microorganism community composition was important for which reason?', '{"A":"It provided preliminary evidence that microorganism-mediated nutrient cycling was accelerated in the transplanted cores.","B":"It suggested that temperature-induced changes in microorganism activity may be occurring at increasingly high elevations.","C":"It ruled out a potential alternative explanation for the acceleration in microorganism-mediated nutrient cycling.","D":"It clarified that microorganism activity levels in the plant-soil cores varied depending on which microorganisms comprised the community."}'::jsonb, NULL, 'C', NULL, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '2-12', 12, 'mcq', 'Some astronomers searching for extraterrestrial life have proposed that atmospheric NH3 (ammonia) can serve as a biosignature gas—an indication that a planet harbors life. Jingcheng Huang, Sara Seager, and colleagues evaluated this possibility, finding that on rocky planets, atmospheric NH3 likely couldn''t reach detectably high levels in the absence of biological activity. But the team also found that on so-called mini-Neptunes—gas planets smaller than Neptune but with atmospheres similar to Neptune''s—atmospheric pressure and temperature can be high enough to produce atmospheric NH3.', NULL, 'Based on the text, Huang, Seager, and colleagues would most likely agree with which statement about atmospheric NH3?', '{"A":"Its presence is more likely to indicate that a planet is a mini-Neptune than that the planet is a rocky planet that could support life.","B":"Its absence from a planet that''s not a mini-Neptune indicates that the planet probably doesn''t have life.","C":"It should be treated as a biosignature gas if detected in the atmosphere of a rocky planet but not if detected in the atmosphere of a mini-Neptune.","D":"It doesn''t reliably reach high enough concentrations in the atmospheres of rocky planets or mini-Neptunes to be treated as a biosignature gas."}'::jsonb, NULL, 'C', NULL, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '2-13', 13, 'mcq', 'Recreation Visits by Month to Four US National Parks during the Peak Season in 2021. [Line graph: x-axis shows three months (June, July, August); y-axis shows number of recreation visits in thousands, from 0 to 1,100. Four lines plotted: Yellowstone, Zion, Grand Canyon, and Rocky Mountain.]

In 2021, four of the United States national parks that were among the most visited were Grand Canyon National Park, Rocky Mountain National Park, Yellowstone National Park, and Zion National Park. The graph shows the number of visits for recreation to each of these parks during the three-month period with the highest number of visitors. A student notes that among the parks shown in the graph, the park with the highest monthly recreation visits in all three months was ______

(Figure: Line graph titled "Recreation Visits by Month to Four US National Parks during the Peak Season in 2021." X-axis: months June, July, August. Y-axis: number of recreation visits (in thousands), 0 to 1,100. Four lines: Yellowstone, Zion, Grand Canyon, Rocky Mountain.)', 'Line graph titled "Recreation Visits by Month to Four US National Parks during the Peak Season in 2021." X-axis: months June, July, August. Y-axis: number of recreation visits (in thousands), 0 to 1,100. Four lines: Yellowstone, Zion, Grand Canyon, Rocky Mountain.', 'Which choice most effectively uses data from the graph to complete the text?', '{"A":"Zion National Park.","B":"Rocky Mountain National Park.","C":"Yellowstone National Park.","D":"Grand Canyon National Park."}'::jsonb, NULL, 'C', NULL, NULL, 23)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '2-14', 14, 'mcq', '"Lines Written in Early Spring" is a 1798 poem by William Wordsworth. In the poem, the speaker describes having contradictory feelings while experiencing the sights and sounds of a spring day: ______', NULL, 'Which quotation from "Lines Written in Early Spring" most effectively illustrates the claim?', '{"A":"\"Through primrose-tufts, in that sweet bower, / The periwinkle trail''d its wreathes; / And ''tis my faith that every flower / Enjoys the air it breathes.\"","B":"\"The budding twigs spread out their fan, / To catch the breezy air; / And I must think, do all I can, / That there was pleasure there.\"","C":"\"The birds around me hopp''d and play''d: / Their thoughts I cannot measure, / But the least motion which they made, / It seem''d a thrill of pleasure.\"","D":"\"I heard a thousand blended notes, / While in a grove I [sat] reclined, / In that sweet mood when pleasant thoughts / Bring sad thoughts to the mind.\""}'::jsonb, NULL, 'D', NULL, NULL, 23)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '2-15', 15, 'mcq', 'Mean Ratings for Patients after 21 Days. [Table with columns: Measure; Mean rating for participants aware of taking a placebo; Mean rating for participants in the control group. Rows: Global improvement — 5.0, 3.9; Symptom severity reduction — 92.00, 46.00; Quality of life improvement — 11.4, 5.4.]

To test whether a medication is effective, scientists compare outcomes for patients taking it and patients taking a placebo (a medically inactive substance). Patients normally aren''t told they''re receiving a placebo, but a research team conducted a study to see if there might be a medical benefit to telling them. The team used various measures to evaluate participants, with higher ratings indicating greater well-being in each measure. Compared to the mean ratings after 21 days for participants in the control group, the mean ratings for participants who were aware of taking a placebo ______', NULL, 'Which choice most effectively uses data from the table to complete the statement?', '{"A":"ranged from 5.0 to 92.00, indicating that well-being varied widely from participant to participant.","B":"were lower for two measures, with the rating for only one measure indicating greater well-being for these participants.","C":"ranged from 3.9 to 46.00, with no rating indicating greater well-being in any measure for these participants.","D":"were higher for all three measures, indicating greater overall well-being for these participants."}'::jsonb, NULL, 'D', NULL, NULL, 24)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '2-16', 16, 'mcq', 'As media consumption has become increasingly multiplatform and socially mediated, active news acquisition has diminished in favor of an attitude known as "news finds me" (NFM), in which people passively rely on their social networks and ambient media environments for information about current events. Homero Gil de Zúñiga and Trevor Diehl examined data on a representative group of adults in the United States to determine participants'' strength of NFM attitude, political knowledge, and political interest. Although no major election took place sufficiently near the study for Gil de Zúñiga and Diehl to identify causality between NFM and voting behavior, they did posit that NFM may reduce voting probability through an indirect effect.', NULL, 'Which finding, if true, would most directly support the idea advanced by Gil de Zúñiga and Diehl?', '{"A":"NFM attitude tends to increase in strength as major elections approach, and people are significantly more likely to vote in major elections than in minor elections.","B":"NFM attitude has a strong negative effect on political knowledge and interest, and there is known to be a strong positive correlation between political knowledge and interest and the likelihood of voting.","C":"Political interest is known to have a strong positive effect on likelihood of voting but shows only a weak positive effect on political knowledge, and NFM attitude shows little correlation with either political knowledge or political interest.","D":"The likelihood of voting increases as political knowledge increases, and the relationship between NFM attitude and political knowledge tends to strengthen as the size of people''s social networks increases."}'::jsonb, NULL, 'B', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '2-17', 17, 'mcq', 'The practice of logging (cutting down trees for commercial and other uses) is often thought to be at odds with forest conservation (the work of preserving forests). However, a massive study in forest management and preservation spanning 700,000 hectares in Oregon''s Malheur National Forest calls that view into question. So far, results of the study suggest that forest plots that have undergone limited logging (the careful removal of a controlled number of trees) may be more robust than plots that haven''t been logged at all. These results, in turn, suggest that ______', NULL, 'Which choice most logically completes the text?', '{"A":"logging may be useful for maintaining healthy forests, provided it is limited.","B":"other forest management strategies are more effective than limited logging.","C":"as time passes, it will be difficult to know whether limited logging has any benefits.","D":"the best way to support forest health may be to leave large forests entirely untouched."}'::jsonb, NULL, 'A', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '2-18', 18, 'mcq', 'Even with the widespread adoption of personal computers, many authors still choose to write and revise their novels by hand and only then transcribe the final version on a computer. It may be tempting to speculate about how a novel written this way would be affected if it had been exclusively typed instead, but each novel is a unique entity resulting from a specific set of circumstances. Therefore, ______', NULL, 'Which choice most logically completes the text?', '{"A":"in order to increase their efficiency, authors who currently write their novels largely by hand should instead work only on a computer.","B":"authors who do most of their drafting and revising by hand likely have more success than those who work entirely on a computer.","C":"novels written by hand take less time to produce, on average, than novels written on a computer do.","D":"there is no way to reasonably evaluate how a work would be different if it had been written by other means."}'::jsonb, NULL, 'D', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '2-19', 19, 'mcq', 'In forecasting weather events, meteorologists sometimes discuss the role of atmospheric rivers. What are atmospheric rivers, and how ______ Part of the water cycle, atmospheric rivers are narrow channels of moisture moving through the atmosphere. In certain conditions, these "rivers" can release some of their moisture as precipitation.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"do they affect our weather.","B":"they do affect our weather.","C":"do they affect our weather?","D":"they do affect our weather?"}'::jsonb, NULL, 'C', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '2-20', 20, 'mcq', 'One of the few African American global explorers during the turn of the 20th century, ______', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"Matthew Henson made several treks across Greenland between 1891 and 1909.","B":"1891 and 1909 were the years between which Matthew Henson made several treks across Greenland.","C":"Greenland was where Matthew Henson made several treks between 1891 and 1909.","D":"several treks across Greenland were made by Matthew Henson between 1891 and 1909."}'::jsonb, NULL, 'A', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '2-21', 21, 'mcq', 'Woven from recycled yarn and hand tufted using a carpet weaving technique passed down by the artist''s Turkish grandmother, ______ so lush and tactilely inviting that you are tempted to reach out and touch them.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"the topological tapestries of Argentine textile artist Alexandra Kehayoglou are","B":"the Argentine textile artist Alexandra Kehayoglou creates topological tapestries that are","C":"when she creates her topological tapestries, Argentine textile artist Alexandra Kehayoglou makes them","D":"Alexandra Kehayoglou is an Argentine textile artist whose topological tapestries are"}'::jsonb, NULL, 'A', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '2-22', 22, 'mcq', 'Physical materials can be classified by how much light passes through them. Clear glass, which is classified as transparent, allows all (or almost all) light to pass ______ wax paper, which is classified as translucent, allows only some light to pass through.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"through,","B":"through","C":"through;","D":"through and"}'::jsonb, NULL, 'C', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '2-23', 23, 'mcq', 'Using natural debris, such as dried ______ such as plastic bags; and more traditional art supplies, such as tree glue, Ghanaian artist Ed Franklin Gavua creates his striking Yiiiiikakaii African masks, which he hopes can help viewers rethink how waste is used in their communities.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"leaves, man-made trash:","B":"leaves; man-made trash,","C":"leaves, man-made trash,","D":"leaves; man-made trash;"}'::jsonb, NULL, 'B', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '2-24', 24, 'mcq', 'Latin America is known to have dozens, if not hundreds, of popular dance forms. Only five of these dances are included in international ballroom dance ______ rumba, samba, cha-cha-cha, paso doble, and jive—the last of which is grouped with the other Latin dances despite not having Latin roots.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"competitions, however:","B":"competitions, however,","C":"competitions, however;","D":"competitions; however,"}'::jsonb, NULL, 'A', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '2-25', 25, 'mcq', 'For thousands of years, humans have used domesticated goats (Capra hircus) to clear land of unwanted vegetation. When it comes to their diets, goats are notoriously ______ they will devour all kinds of shrubs and weeds, leaving virtually no part of any plant unconsumed.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"indiscriminate and","B":"indiscriminate,","C":"indiscriminate","D":"indiscriminate:"}'::jsonb, NULL, 'D', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '2-26', 26, 'mcq', 'A species of Byropsis algae produces toxins to avoid being eaten by predators. However, in some cases, the toxins the organism uses to protect itself from predation actually ______ its attractiveness to predators. The Hawaiian sea slug, for example, not only tolerates Byropsis toxins but actually uses them for protection in the same way the algae does.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"is increasing","B":"increase","C":"increases","D":"has increased"}'::jsonb, NULL, 'B', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '2-27', 27, 'mcq', 'After appropriate permissions are granted, a typical archaeological dig begins with a surveyor making a detailed grid of the excavation site. Then, the site is carefully dug, and any artifacts found are recorded and mapped onto the site grid. ______ the artifacts are removed, cataloged, and analyzed in a laboratory.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"For instance,","B":"On the contrary,","C":"Earlier,","D":"Finally,"}'::jsonb, NULL, 'D', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 28, '2-28', 28, 'mcq', 'The liquid metals in Earth''s core circulate constantly, and this circulation generates electrical currents that flow between Earth''s North and South magnetic poles. These electrical currents, ______ create a barrier around Earth that protects us from radiation and charged particles coming from space.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"in turn,","B":"likewise,","C":"nevertheless,","D":"in reality,"}'::jsonb, NULL, 'A', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 29, '2-29', 29, 'mcq', 'Biographer Michael Gorra notes that the novelist Henry James "lived in a world of second thoughts," frequently tinkering with his novels and stories after their initial publication. However, the differences between the 1881 first edition and the 1908 edition of his novel A Portrait of a Lady are extreme, even by James''s standards; ______ some critics regard the two editions as two different novels altogether.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"by contrast,","B":"in fact,","C":"nevertheless,","D":"in other words,"}'::jsonb, NULL, 'B', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 30, '2-30', 30, 'mcq', 'While researching a topic, a student has taken the following notes:
• In World War I, US soldiers who were members of the Choctaw Nation in Oklahoma participated in the Choctaw Code Talkers program.
• The Choctaw Code Talkers were trained to relay coded military information in their native language.
• In World War II, the US Army recruited Navajo (Diné) soldiers to transmit coded messages in their native language.
• These soldiers were known as the Navajo Code Talkers.

The student wants to emphasize a similarity between the Choctaw Code Talkers and the Navajo Code Talkers. Which choice most effectively uses relevant information from the notes to accomplish this goal?', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"US soldiers who were members of the Choctaw Nation in Oklahoma used their native language to relay coded information.","B":"In World War II, one group of Navajo (Diné) soldiers was known as the Navajo Code Talkers.","C":"Both the Choctaw Code Talkers and the Navajo Code Talkers transmitted coded military messages in the soldiers'' native languages.","D":"The Choctaw Code Talkers, not the Navajo Code Talkers, served in World War I."}'::jsonb, NULL, 'C', NULL, NULL, 29)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 31, '2-31', 31, 'mcq', 'While researching a topic, a student has taken the following notes:
• Meteorites found on Earth are divided into two categories.
• A meteorite that was observed falling to Earth before being recovered is known as a meteorite fall.
• All other meteorites found on Earth are known as meteorite finds.
• There have been about 1,200 recorded meteorite falls.
• There have been over 60,000 recorded meteorite finds.

The student wants to contrast the number of meteorite falls with the number of meteorite finds. Which choice most effectively uses relevant information from the notes to accomplish this goal?', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"A meteorite that was observed falling to Earth before being recovered is known as a meteorite fall; all others are known as meteorite finds.","B":"Meteorites found on Earth are divided into two categories: meteorite falls and meteorite finds.","C":"There have been about 1,200 recorded meteorite falls, or meteorites observed falling to Earth.","D":"While there have been only about 1,200 recorded meteorite falls, there have been over 60,000 meteorite finds."}'::jsonb, NULL, 'D', NULL, NULL, 29)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 32, '2-32', 32, 'mcq', 'While researching a topic, a student has taken the following notes:
• Doña María do Carmo Bandeira was a Brazilian botanist.
• Between 1924 and 1941, she collected approximately 800 botanical samples.
• She collected a sample of Polytrichum juniperinum from Serra de Itatiaia in Mauá in February of 1925.
• She collected a sample of Sphagnum gracilescen from Ponte do Inferno in Corcovado in March of 1925.
• Polytrichum juniperinum and Sphagnum gracilescen are both species of moss.

The student wants to emphasize the sample collected from Serra de Itatiaia. Which choice most effectively uses relevant information from the notes to accomplish this goal?', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Doña María do Carmo Bandeira was a botanist notable for collecting approximately 800 botanical samples between 1924 and 1941.","B":"Among the many botanical samples Doña María do Carmo Bandeira collected was Polytrichum juniperinum, a species of moss she collected from Serra de Itatiaia in 1925.","C":"Between 1924 and 1941, Doña María do Carmo Bandeira collected many botanical samples, such as Polytrichum juniperinum from Serra de Itatiaia and Sphagnum gracilescen from Ponte do Inferno.","D":"Between 1924 and 1941, Doña María do Carmo Bandeira collected samples of Polytrichum juniperinum and Sphagnum gracilescen, both species of moss."}'::jsonb, NULL, 'B', NULL, NULL, 30)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 33, '2-33', 33, 'mcq', 'While researching a topic, a student has taken the following notes:
• The US government classifies sensitive information according to the degree to which disclosure could affect the nation''s security.
• Information that could cause "damage" to national security is classified as Confidential.
• Information that could cause "serious damage" to national security is classified as Secret.
• Most routine diplomatic correspondence, if disclosed, could cause damage but not serious damage to national security.
• Diplomatic correspondence includes communication with both allies and adversaries.

The student wants to indicate which category most routine diplomatic correspondence belongs in, based on how sensitive information is classified. Which choice most effectively uses relevant information from the notes to accomplish this goal?', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"According to the US government, which classifies such sensitive information as routine diplomatic correspondence, Confidential information could damage national security if disclosed.","B":"Most routine diplomatic correspondence is classified according to the degree to which disclosure could affect the nation''s security.","C":"Having the potential to damage national security if disclosed, most routine diplomatic correspondence is classified as Confidential.","D":"If disclosed, communication with both allies and adversaries could affect the nation''s security."}'::jsonb, NULL, 'C', NULL, NULL, 30)
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
  VALUES (v_mod, 1, '3-1', 1, 'mcq', NULL, NULL, '$(p + 3) + 8 = 10$

What value of $p$ is the solution to the given equation?', '{"A":"$-1$","B":"$5$","C":"$15$","D":"$21$"}'::jsonb, NULL, 'A', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '3-2', 2, 'mcq', '(Figure: Scatterplot in the xy-plane. The horizontal x-axis is labeled from 1 to 7 and the vertical y-axis is labeled 1,000 to 5,000 in increments of 1,000, origin O. Data points rise with a concave-up (exponential-like) pattern: points near (0.3, 100), (2, 250), (3, 250), (3.5, 900), (4, 800), (5, 2200), (5.5, 2600), and (6.5, 4800). Each answer choice A-D overlays the same scatterplot with a different candidate model curve.)', 'Scatterplot in the xy-plane. The horizontal x-axis is labeled from 1 to 7 and the vertical y-axis is labeled 1,000 to 5,000 in increments of 1,000, origin O. Data points rise with a concave-up (exponential-like) pattern: points near (0.3, 100), (2, 250), (3, 250), (3.5, 900), (4, 800), (5, 2200), (5.5, 2600), and (6.5, 4800). Each answer choice A-D overlays the same scatterplot with a different candidate model curve.', 'The scatterplot shows the relationship between two variables, $x$ and $y$.

Which of the following graphs shows the most appropriate model for the data?', '{"A":"A graph with a straight line of positive slope rising from the origin to about $(7, 5000)$.","B":"A graph with a straight line of negative slope from about $(0, 5000)$ down to about $(7, 0)$.","C":"A graph with an increasing exponential curve starting near $y = 1000$ at $x = 0$ and rising steeply.","D":"A graph with an increasing exponential curve starting near the origin and rising steeply."}'::jsonb, NULL, 'D', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '3-3', 3, 'mcq', NULL, NULL, '$k^2 - 53 = 91$

What is the positive solution to the given equation?', '{"A":"$144$","B":"$72$","C":"$38$","D":"$12$"}'::jsonb, NULL, 'D', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '3-4', 4, 'mcq', NULL, NULL, 'During a portion of a flight, a small airplane''s cruising speed varied between 150 miles per hour and 170 miles per hour. Which inequality best represents this situation, where $s$ is the cruising speed, in miles per hour, during this portion of the flight?', '{"A":"$s \\le 20$","B":"$s \\le 150$","C":"$s \\le 170$","D":"$150 \\le s \\le 170$"}'::jsonb, NULL, 'D', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '3-5', 5, 'mcq', '(Figure: Graph in the xy-plane. The horizontal axis is labeled "Time (seconds)" with gridlines from 1 to 10; the vertical axis is labeled "Height above ground (meters)" with gridlines at 10, 20, 30, 40, 50, 60. The curve starts above the origin, rises to a maximum height of about 60 meters near x = 3, then decreases, crossing the x-axis near x = 9 (a concave-down parabola-like flight path).)', 'Graph in the xy-plane. The horizontal axis is labeled "Time (seconds)" with gridlines from 1 to 10; the vertical axis is labeled "Height above ground (meters)" with gridlines at 10, 20, 30, 40, 50, 60. The curve starts above the origin, rises to a maximum height of about 60 meters near x = 3, then decreases, crossing the x-axis near x = 9 (a concave-down parabola-like flight path).', 'An object was launched upward from a platform. The graph shown models the height above ground, $y$, in meters, of the object $x$ seconds after it was launched. For which of the following intervals of time was the height of the object increasing for the entire interval?', '{"A":"From $x = 0$ to $x = 2$","B":"From $x = 0$ to $x = 4$","C":"From $x = 2$ to $x = 3$","D":"From $x = 3$ to $x = 4$"}'::jsonb, NULL, 'A', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '3-6', 6, 'grid', NULL, NULL, 'How many yards are equivalent to 1,116 inches? (1 yard = 36 inches)', NULL, NULL, '31', '["31"]'::jsonb, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '3-7', 7, 'grid', NULL, NULL, '$f(x) = 14 + 4x$

The function $f$ represents the total cost, in dollars, of attending an arcade when $x$ games are played. How many games can be played for a total cost of \$58?', NULL, NULL, '11', '["11"]'::jsonb, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '3-8', 8, 'mcq', NULL, NULL, '$f(x) = x + b$

For the linear function $f$, $b$ is a constant. When $x = 0$, $f(x) = 30$. What is the value of $b$?', '{"A":"$-30$","B":"$-\\dfrac{1}{30}$","C":"$\\dfrac{1}{30}$","D":"$30$"}'::jsonb, NULL, 'D', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '3-9', 9, 'mcq', NULL, NULL, '$P(t) = 1{,}800(1.02)^t$

The function $P$ gives the estimated number of marine mammals in a certain area, where $t$ is the number of years since a study began. What is the best interpretation of $P(0) = 1{,}800$ in this context?', '{"A":"The estimated number of marine mammals in the area was 102 when the study began.","B":"The estimated number of marine mammals in the area was 1,800 when the study began.","C":"The estimated number of marine mammals in the area increased by 102 each year during the study.","D":"The estimated number of marine mammals in the area increased by 1,800 each year during the study."}'::jsonb, NULL, 'B', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '3-10', 10, 'mcq', NULL, NULL, 'A manager is responsible for ordering supplies for a shaved ice shop. The shop''s inventory starts with 4,500 paper cups, and the manager estimates that 70 of these paper cups are used each day. Based on this estimate, in how many days will the supply of paper cups reach 1,700?', '{"A":"$20$","B":"$40$","C":"$60$","D":"$80$"}'::jsonb, NULL, 'B', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '3-11', 11, 'mcq', 'Table A: x-values 2, 4, 6 with y-values 19, 30, 41. Table B: x-values 2, 4, 6 with y-values 8, 16, 24. Table C: x-values 2, 4, 6 with y-values 13, 18, 23. Table D: x-values 2, 4, 6 with y-values 13, 21, 29.', NULL, '$y > 4x + 8$

For which of the following tables are all the values of $x$ and their corresponding values of $y$ solutions to the given inequality?', '{"A":"Table with $x = 2, 4, 6$ and $y = 19, 30, 41$.","B":"Table with $x = 2, 4, 6$ and $y = 8, 16, 24$.","C":"Table with $x = 2, 4, 6$ and $y = 13, 18, 23$.","D":"Table with $x = 2, 4, 6$ and $y = 13, 21, 29$."}'::jsonb, NULL, 'A', NULL, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '3-12', 12, 'mcq', NULL, NULL, 'Which expression is equivalent to $(x^2 + 11)^2 + (x - 5)(x + 5)$?', '{"A":"$x^4 + 23x^2 - 14$","B":"$x^4 + 23x^2 + 96$","C":"$x^4 + 12x^2 + 121$","D":"$x^4 + x^2 + 146$"}'::jsonb, NULL, 'B', NULL, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '3-13', 13, 'grid', NULL, NULL, 'The function $h$ is defined by $h(x) = \dfrac{8}{5x + 6}$. What is the value of $h(2)$?', NULL, NULL, '0.5', '["0.5","1/2"]'::jsonb, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '3-14', 14, 'grid', '(Figure: A right triangle with the right angle at the bottom-left vertex. The vertical leg on the left is labeled 3 and the horizontal leg along the bottom is labeled 5. The hypotenuse runs from the top of the vertical leg down to the right end of the horizontal leg. Note: Figure not drawn to scale.)', 'A right triangle with the right angle at the bottom-left vertex. The vertical leg on the left is labeled 3 and the horizontal leg along the bottom is labeled 5. The hypotenuse runs from the top of the vertical leg down to the right end of the horizontal leg. Note: Figure not drawn to scale.', 'The figure shows the lengths, in inches, of two sides of a right triangle. What is the area of the triangle, in square inches?', NULL, NULL, '7.5', '["7.5","15/2"]'::jsonb, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '3-15', 15, 'mcq', '(Figure: Graph in the xy-plane. The horizontal x-axis is labeled 1 to 6 and the vertical y-axis is labeled in unit increments from 1 to 13. A smooth concave-down curve begins at about (0, 5), rises through the points, and levels off near a maximum of about 13 around x = 4 to 5.)', 'Graph in the xy-plane. The horizontal x-axis is labeled 1 to 6 and the vertical y-axis is labeled in unit increments from 1 to 13. A smooth concave-down curve begins at about (0, 5), rises through the points, and levels off near a maximum of about 13 around x = 4 to 5.', 'The graph models the number of active projects a company was working on $x$ months after the end of November 2012, where $0 \le x \le 6$. According to the model, what is the predicted number of active projects the company was working on at the end of November 2012?', '{"A":"$0$","B":"$5$","C":"$8$","D":"$9$"}'::jsonb, NULL, 'B', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '3-16', 16, 'mcq', NULL, NULL, 'The relationship between two variables, $x$ and $y$, is linear. For every increase in the value of $x$ by 1, the value of $y$ increases by 8. When the value of $x$ is 2, the value of $y$ is 18. Which equation represents this relationship?', '{"A":"$y = 2x + 18$","B":"$y = 2x + 8$","C":"$y = 8x + 2$","D":"$y = 3x + 26$"}'::jsonb, NULL, 'C', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '3-17', 17, 'mcq', NULL, NULL, '$P = N(19 - C)$

The given equation relates the positive numbers $P$, $N$, and $C$. Which equation correctly expresses $C$ in terms of $P$ and $N$?', '{"A":"$C = \\dfrac{19 + P}{N}$","B":"$C = \\dfrac{19 - P}{N}$","C":"$C = 19 + \\dfrac{P}{N}$","D":"$C = 19 - \\dfrac{P}{N}$"}'::jsonb, NULL, 'D', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '3-18', 18, 'mcq', NULL, NULL, '$w^2 + 12w - 40 = 0$

Which of the following is a solution to the given equation?', '{"A":"$6 - 2\\sqrt{19}$","B":"$2\\sqrt{19}$","C":"$\\sqrt{19}$","D":"$-6 + 2\\sqrt{19}$"}'::jsonb, NULL, 'D', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '3-19', 19, 'mcq', 'The table shown summarizes the number of employees at each of the 17 restaurants in a town. Number of employees / Number of restaurants: 2 to 7 / 2; 8 to 13 / 4; 14 to 19 / 2; 20 to 25 / 7; 26 to 31 / 2.', NULL, 'The table shown summarizes the number of employees at each of the 17 restaurants in a town.

Which of the following could be the median number of employees for the restaurants in this town?', '{"A":"$2$","B":"$9$","C":"$15$","D":"$21$"}'::jsonb, NULL, 'D', NULL, NULL, 40)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '3-20', 20, 'grid', NULL, NULL, 'What is the $y$-coordinate of the $y$-intercept of the graph of $\dfrac{3x}{7} = -\dfrac{5y}{9} + 21$ in the $xy$-plane?', NULL, NULL, '189/5', '["189/5","37.8"]'::jsonb, NULL, 40)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '3-21', 21, 'grid', '(Figure: Graph in the xy-plane with x-axis labeled -6, -4, -2, 2, 4 and y-axis labeled 4, 2, -2, -4, -6, -8, -10, origin O. An upward-opening parabola has its vertex near (-1.5, -8) and passes through the points (-2, -6) and (0, -6); it crosses the x-axis near x = -3.5 and x = 0.5.)', 'Graph in the xy-plane with x-axis labeled -6, -4, -2, 2, 4 and y-axis labeled 4, 2, -2, -4, -6, -8, -10, origin O. An upward-opening parabola has its vertex near (-1.5, -8) and passes through the points (-2, -6) and (0, -6); it crosses the x-axis near x = -3.5 and x = 0.5.', 'The graph of $y = 2x^2 + bx + c$ is shown, where $b$ and $c$ are constants. What is the value of $bc$?', NULL, NULL, '-24', '["-24"]'::jsonb, NULL, 40)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '3-22', 22, 'mcq', NULL, NULL, 'In 2008, Zinah earned 14% more than in 2007, and in 2009 Zinah earned 4% more than in 2008. If Zinah earned $y$ times as much in 2009 as in 2007, what is the value of $y$?', '{"A":"$0.5600$","B":"$1.0056$","C":"$1.1800$","D":"$1.1856$"}'::jsonb, NULL, 'D', NULL, NULL, 40)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '3-23', 23, 'mcq', '(Figure: Graph in the xy-plane with x-axis labeled -6, -4, -2, 2 and y-axis labeled -6, -4, -2, 2, 4, 6, origin O. Circle A is drawn centered at (-2, 0) with radius 3 (a dot marks the center).)', 'Graph in the xy-plane with x-axis labeled -6, -4, -2, 2 and y-axis labeled -6, -4, -2, 2, 4, 6, origin O. Circle A is drawn centered at (-2, 0) with radius 3 (a dot marks the center).', 'Circle $A$ (shown) is defined by the equation $(x + 2)^2 + y^2 = 9$. Circle $B$ (not shown) is the result of shifting circle $A$ down 6 units and increasing the radius so that the radius of circle $B$ is 2 times the radius of circle $A$. Which equation defines circle $B$?', '{"A":"$(x + 2)^2 + (y + 6)^2 = (4)(9)$","B":"$2(x + 2)^2 + 2(y + 6)^2 = 9$","C":"$(x + 2)^2 + (y - 6)^2 = (4)(9)$","D":"$2(x + 2)^2 + 2(y - 6)^2 = 9$"}'::jsonb, NULL, 'A', NULL, NULL, 41)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '3-24', 24, 'mcq', '(Figure: Right triangle ABC with the right angle at vertex C (bottom-left). Vertex A is at the top-left, vertex B at the bottom-right. The hypotenuse AB is labeled 54, and the angle at B is labeled 30 degrees. Note: Figure not drawn to scale.)', 'Right triangle ABC with the right angle at vertex C (bottom-left). Vertex A is at the top-left, vertex B at the bottom-right. The hypotenuse AB is labeled 54, and the angle at B is labeled 30 degrees. Note: Figure not drawn to scale.', 'Right triangle $ABC$ is shown. What is the value of $\tan A$?', '{"A":"$\\dfrac{\\sqrt{3}}{54}$","B":"$\\dfrac{1}{\\sqrt{3}}$","C":"$\\sqrt{3}$","D":"$27\\sqrt{3}$"}'::jsonb, NULL, 'C', NULL, NULL, 41)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '3-25', 25, 'mcq', NULL, NULL, 'At the time that an article was first featured on the home page of a news website, there were 40 comments on the article. An exponential model estimates that at the end of each hour after the article was first featured on the home page, the number of comments on the article had increased by 190% of the number of comments on the article at the end of the previous hour. Which of the following equations best represents this model, where $C$ is the estimated number of comments on the article $t$ hours after the article was first featured on the home page and $t \le 4$?', '{"A":"$C = 40(1.19)^t$","B":"$C = 40(1.9)^t$","C":"$C = 40(19)^t$","D":"$C = 40(2.9)^t$"}'::jsonb, NULL, 'D', NULL, NULL, 42)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '3-26', 26, 'mcq', 'The table shows three values of x and their corresponding values of g(x). x / g(x): -27 / 3; -9 / 0; 21 / 5.', NULL, 'The table shows three values of $x$ and their corresponding values of $g(x)$, where $g(x) = \dfrac{f(x)}{x + 3}$ and $f$ is a linear function. What is the $y$-intercept of the graph of $y = f(x)$ in the $xy$-plane?', '{"A":"$(0, 36)$","B":"$(0, 12)$","C":"$(0, 4)$","D":"$(0, -9)$"}'::jsonb, NULL, 'A', NULL, NULL, 42)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '3-27', 27, 'grid', NULL, NULL, 'In right triangle $ABC$, angle $C$ is the right angle and $BC = 162$. Point $D$ on side $AB$ is connected by a line segment with point $E$ on side $AC$ such that line segment $DE$ is parallel to side $BC$ and $CE = 2AE$. What is the length of line segment $DE$?', NULL, NULL, '54', '["54"]'::jsonb, NULL, 42)
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
  VALUES (v_mod, 1, '4-1', 1, 'mcq', NULL, NULL, 'The function $f$ is defined by $f(x) = 8x$. For what value of $x$ does $f(x) = 72$?', '{"A":"1","B":"9","C":"64","D":"80"}'::jsonb, NULL, 'B', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '4-2', 2, 'mcq', 'Note: Figure not drawn to scale.

(Figure: Two straight lines cross at a single point, forming an X. Angle 1 and angle 2 are the pair of vertical (opposite) angles formed at the intersection.)', 'Two straight lines cross at a single point, forming an X. Angle 1 and angle 2 are the pair of vertical (opposite) angles formed at the intersection.', 'In the figure, two lines intersect at a point. Angle 1 and angle 2 are vertical angles. The measure of angle 1 is $72°$. What is the measure of angle 2?', '{"A":"$72°$","B":"$108°$","C":"$144°$","D":"$288°$"}'::jsonb, NULL, 'A', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '4-3', 3, 'mcq', NULL, NULL, 'On a street with 7 houses, 2 houses are blue. If a house from this street is selected at random, what is the probability of selecting a house that is blue?', '{"A":"$\\frac{1}{7}$","B":"$\\frac{2}{7}$","C":"$\\frac{5}{7}$","D":"$\\frac{7}{2}$"}'::jsonb, NULL, 'B', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '4-4', 4, 'mcq', '(Figure: An xy-coordinate plane with gridlines, x-axis from about -10 to 10 and y-axis from about -10 to 10. A single straight line is graphed that falls from upper-left to lower-right, crossing the axes (a line with negative slope).)', 'An xy-coordinate plane with gridlines, x-axis from about -10 to 10 and y-axis from about -10 to 10. A single straight line is graphed that falls from upper-left to lower-right, crossing the axes (a line with negative slope).', 'The graph of function $f$ is shown, where $y = f(x)$. Which of the following describes function $f$?', '{"A":"Increasing linear","B":"Decreasing linear","C":"Increasing exponential","D":"Decreasing exponential"}'::jsonb, NULL, 'A', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '4-5', 5, 'mcq', '(Figure: An xy-coordinate plane with origin O. The x-axis is marked at 2 and 4; the y-axis is marked at -2, -4, -6, -8. A straight line with positive slope rises from lower-left to upper-right, crossing the y-axis below the origin (between 0 and -4) and crossing the x-axis at a positive x-value.)', 'An xy-coordinate plane with origin O. The x-axis is marked at 2 and 4; the y-axis is marked at -2, -4, -6, -8. A straight line with positive slope rises from lower-left to upper-right, crossing the y-axis below the origin (between 0 and -4) and crossing the x-axis at a positive x-value.', 'The graph of the function $f$ is shown, where $y = f(x)$. What is the $y$-intercept of the graph?', '{"A":"$(0, -1)$","B":"$(0, -4)$","C":"$(0, 1)$","D":"$(0, 4)$"}'::jsonb, NULL, 'B', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '4-6', 6, 'grid', NULL, NULL, '$$x = 8$$
$$x + 3y = 26$$
The solution to the given system of equations is $(x, y)$. What is the value of $y$?', NULL, NULL, '6', '["6"]'::jsonb, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '4-7', 7, 'grid', NULL, NULL, 'The amount of Hanna''s bill for a food order was $50. Hanna gave a tip of 20% of the amount of the bill. What is the amount, in dollars, of the tip Hanna gave?', NULL, NULL, '10', '["10"]'::jsonb, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '4-8', 8, 'mcq', NULL, NULL, 'Which expression is equivalent to $5x^5 - 6x^4 + 8x^3$?', '{"A":"$x^4(5x - 6)$","B":"$x^3(5x^2 - 6x + 8)$","C":"$8x^3(5x^2 - 6x + 1)$","D":"$6x^5(-6x^4 + 8x^3 + 1)$"}'::jsonb, NULL, 'B', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '4-9', 9, 'mcq', NULL, NULL, 'The ratio of the length of line segment $XY$ to the length of line segment $ZV$ is 6 to 1. If the length of line segment $XY$ is 102 inches, what is the length, in inches, of line segment $ZV$?', '{"A":"17","B":"96","C":"102","D":"612"}'::jsonb, NULL, 'A', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '4-10', 10, 'mcq', NULL, NULL, '$$7(2x - 3) = 63$$
Which equation has the same solution as the given equation?', '{"A":"$2x - 3 = 9$","B":"$2x - 3 = 56$","C":"$2x - 21 = 63$","D":"$2x - 21 = 70$"}'::jsonb, NULL, 'A', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '4-11', 11, 'mcq', NULL, NULL, 'The function $f$ defined by $f(t) = 14t + 9$ gives the estimated length, in inches, of a vine plant $t$ months after Tavon purchased it. Which of the following is the best interpretation of 9 in this context?', '{"A":"Tavon will keep the vine plant for 9 months.","B":"The vine plant is expected to grow 9 inches each month.","C":"The vine plant is expected to grow to a maximum length of 9 inches.","D":"The estimated length of the vine plant was 9 inches when Tavon purchased it."}'::jsonb, NULL, 'D', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '4-12', 12, 'mcq', NULL, NULL, '$$(x + 2)(x - 5)(x + 9) = 0$$
What is a positive solution to the given equation?', '{"A":"3","B":"4","C":"5","D":"18"}'::jsonb, NULL, 'C', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '4-13', 13, 'grid', NULL, NULL, 'Brian saves $\frac{2}{5}$ of the $215 he earns each week from his job. If Brian continues to save at this rate, how much money, in dollars, will Brian save in 9 weeks?', NULL, NULL, '774', '["774"]'::jsonb, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '4-14', 14, 'grid', NULL, NULL, 'A rectangle has an area of 155 square inches. The length of the rectangle is 4 inches less than 7 times the width of the rectangle. What is the width of the rectangle, in inches?', NULL, NULL, '5', '["5"]'::jsonb, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '4-15', 15, 'mcq', NULL, NULL, '$$4, 10, 18, 4, 4, 5, 6, 5$$
What is the median of the data set shown?', '{"A":"4","B":"5","C":"7","D":"14"}'::jsonb, NULL, 'B', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '4-16', 16, 'mcq', NULL, NULL, 'A right circular cylinder has a volume of 432 cubic centimeters. The area of the base of the cylinder is 24 square centimeters. What is the height, in centimeters, of the cylinder?', '{"A":"18","B":"24","C":"216","D":"10,368"}'::jsonb, NULL, 'A', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '4-17', 17, 'mcq', NULL, NULL, '$$x^2 = -841$$
How many distinct real solutions does the given equation have?', '{"A":"Exactly one","B":"Exactly two","C":"Infinitely many","D":"Zero"}'::jsonb, NULL, 'D', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '4-18', 18, 'mcq', NULL, NULL, 'Line $k$ is defined by $y = 7x + \frac{1}{8}$. Line $j$ is perpendicular to line $k$ in the $xy$-plane. What is the slope of line $j$?', '{"A":"$-8$","B":"$-\\frac{1}{7}$","C":"$\\frac{1}{8}$","D":"7"}'::jsonb, NULL, 'B', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '4-19', 19, 'mcq', 'Table — Number of cars vs. Maximum number of passengers and crew: 3 cars → 174; 5 cars → 284; 10 cars → 559.', NULL, 'The table shows the linear relationship between the number of cars, $c$, on a commuter train and the maximum number of passengers and crew, $p$, that the train can carry. Which equation represents the linear relationship between $c$ and $p$?', '{"A":"$55c - p = -9$","B":"$55c - p = 9$","C":"$55p - c = -9$","D":"$55p - c = 9$"}'::jsonb, NULL, 'A', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '4-20', 20, 'grid', NULL, NULL, 'If $4^{8c} = \sqrt[3]{4^7}$, what is the value of $c$?', NULL, NULL, '.2916', '[".2916",".2917","7/24"]'::jsonb, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '4-21', 21, 'grid', NULL, NULL, '$$(x - 2) - 4(y + 7) = 117$$
$$(x - 2) + 4(y + 7) = 442$$
The solution to the given system of equations is $(x, y)$. What is the value of $6(x - 2)$?', NULL, NULL, '1677', '["1677"]'::jsonb, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '4-22', 22, 'mcq', NULL, NULL, 'In triangle $ABC$, angle $B$ is a right angle. The length of side $AB$ is $10\sqrt{37}$ and the length of side $BC$ is $24\sqrt{37}$. What is the length of side $AC$?', '{"A":"$14\\sqrt{37}$","B":"$26\\sqrt{37}$","C":"$34\\sqrt{37}$","D":"$\\sqrt{34 \\cdot 37}$"}'::jsonb, NULL, 'B', NULL, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '4-23', 23, 'mcq', NULL, NULL, '$$f(x) = (1.84)^{\frac{x}{4}}$$
The function $f$ is defined by the given equation. The equation can be rewritten as $f(x) = \left(1 + \frac{p}{100}\right)^x$, where $p$ is a constant. Which of the following is closest to the value of $p$?', '{"A":"16","B":"21","C":"46","D":"96"}'::jsonb, NULL, 'A', NULL, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '4-24', 24, 'mcq', NULL, NULL, 'The function $f$ is defined by $f(x) = a\sqrt{x + b}$, where $a$ and $b$ are constants. In the $xy$-plane, the graph of $y = f(x)$ passes through the point $(-24, 0)$, and $f(24) < 0$. Which of the following must be true?', '{"A":"$f(0) = 24$","B":"$f(0) = -24$","C":"$a > b$","D":"$a < b$"}'::jsonb, NULL, 'D', NULL, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '4-25', 25, 'mcq', NULL, NULL, 'In the $xy$-plane, a circle has center $C$ with coordinates $(h, k)$. Points $A$ and $B$ lie on the circle. Point $A$ has coordinates $(h + 1, k + \sqrt{102})$, and $\angle ACB$ is a right angle. What is the length of $\overline{AB}$?', '{"A":"$\\sqrt{206}$","B":"$2\\sqrt{102}$","C":"$103\\sqrt{2}$","D":"$103\\sqrt{3}$"}'::jsonb, NULL, 'A', NULL, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '4-26', 26, 'mcq', '(Figure: A scatterplot on an xy-plane. The x-axis is marked at 4, 8, 12, 16, 20; the y-axis is marked at 10, 20, 30, 40, 50. Several data points rise from lower-left (around x=2, y=14) to upper-right (around x=18, y=40), with an increasing straight line of best fit drawn through them; the line appears to cross the y-axis near y=12.)', 'A scatterplot on an xy-plane. The x-axis is marked at 4, 8, 12, 16, 20; the y-axis is marked at 10, 20, 30, 40, 50. Several data points rise from lower-left (around x=2, y=14) to upper-right (around x=18, y=40), with an increasing straight line of best fit drawn through them; the line appears to cross the y-axis near y=12.', 'The scatterplot shows the relationship between two variables, $x$ and $y$, for data set E. A line of best fit is shown. Data set F is created by multiplying the $y$-coordinate of each data point from data set E by 3.9. Which of the following could be an equation of a line of best fit for data set F?', '{"A":"$y = 46.8 + 5.9x$","B":"$y = 46.8 + 1.5x$","C":"$y = 12 + 5.9x$","D":"$y = 12 + 1.5x$"}'::jsonb, NULL, 'A', NULL, NULL, 50)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '4-27', 27, 'grid', NULL, NULL, '$$48x - 64y = 48y + 24$$
$$ry = \frac{1}{8} - 12x$$
In the given system of equations, $r$ is a constant. If the system has no solution, what is the value of $r$?', NULL, NULL, '-28', '["-28"]'::jsonb, NULL, 50)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
END $seed$;
