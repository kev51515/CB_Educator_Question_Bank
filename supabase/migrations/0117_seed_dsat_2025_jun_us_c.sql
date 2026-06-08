-- =============================================================================
-- Migration: 0117_seed_dsat_2025_jun_us_c.sql
-- Purpose:   Seed "Test #4 — Digital SAT, June 2025 (US, Form C)"
--            into the full-test tables from 0048.
--
--   Source:  2025-06-us-c-rw.pdf (Two Engineers Prep, Bluebook-format reconstruction).
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
  VALUES ('dsat-2025-jun-us-c', 4, 'Test #4 — Digital SAT, June 2025 (US, Form C)', 'DSAT Jun 2025 US C', '2025-06-us-c-rw.pdf', 54)
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
  VALUES (v_mod, 1, '1-1', 1, 'mcq', 'The following text is adapted from William Wordsworth''s 1798 poem "Lines Written a Few Miles above Tintern Abbey."
Once again
Do I behold these steep and lofty cliffs,
Which on a wild secluded scene impress
Thoughts of more deep seclusion; and connect
The landscape with the quiet of the sky.', NULL, 'As used in the text, what does the word "behold" most nearly mean?', '{"A":"possess","B":"regard","C":"omit","D":"escape"}'::jsonb, NULL, 'B', NULL, NULL, 2)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '1-2', 2, 'mcq', 'Although oil shocks—such as the 10% rise in oil prices in November 1970—can strongly affect individual consumers, Gbadebo Oladosu and colleagues have shown that at the level of national economies, their effects are often quite ______. The effect of recent oil shocks on the gross domestic product of Germany, for example, was only slightly greater than zero.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"variable","B":"persistent","C":"subdued","D":"beneficial"}'::jsonb, NULL, 'C', NULL, NULL, 3)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '1-3', 3, 'mcq', 'Writer Lydia Davis observed that while ______ literary forms, such as the poem, are recognizable as such even as they evolve, there are pathbreaking "intergeneric" forms that might, for example, use elements of both fables and realist narratives to create something unclassifiable. Davis''s own very short literary pieces arguably fit in this category, since they straddle the line between prose and poetry.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"innovative","B":"elusive","C":"established","D":"ambiguous"}'::jsonb, NULL, 'C', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '1-4', 4, 'mcq', 'Mauricio Drelichman and Hans-Joachim Voth''s analysis of the debt repayments and expenditure of the government of Philip II (who ruled an empire including Spain and Milan from 1556 to 1598) found a seeming contradiction: although the government had several short-term cash shortages, it ran an even larger surplus than did the government of eighteenth-century Britain, a nation considered ______ of fiscal virtue.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"a sanction","B":"a paradox","C":"an exemplar","D":"an omen"}'::jsonb, NULL, 'C', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '1-5', 5, 'mcq', 'The following text is from Anthony Trollope''s 1855 novel The Warden. Charles James is the son of a high-ranking clergy member.
 Charles James was an exact and careful boy; he never committed himself; he well knew how much was expected from the eldest son of the Archdeacon of Barchester, and was therefore mindful not to mix too freely with other boys. He had not the great talents of his younger brothers, but he exceeded them in judgment and propriety of demeanour; his fault, if he had one, was an over-attention to words instead of things; there was a thought too much finesse about him, and, as even his father sometimes told him, he was too fond of a compromise.', NULL, 'Which choice best states the function of the phrase "if he had one" in the text as a whole?', '{"A":"It acknowledges that the qualities in Charles James the narrator goes on to describe may not actually be undesirable characteristics.","B":"It concedes that Charles James''s attempts to be held in respect are sometimes fruitless.","C":"It signals a shift in focus from describing Charles James''s good qualities to criticizing his tendency to place too much value on artfulness.","D":"It anticipates readers'' objections to the narrator''s criticism of Charles James''s faults."}'::jsonb, NULL, 'C', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '1-6', 6, 'mcq', 'The establishment of urban green spaces for the abatement of fine particulate matter and other major air-pollutant concentrations is gaining public support, but urban planners must proceed with caution given subtleties in the body of evidence for the strategy''s efficacy. High-level reports have attributed pollutant reductions to cities'' inclusion of green spaces; however, one study found that while trees are negatively associated with air pollutants when considered on a citywide scale, at the street level, this association is minimal and at times positive. Because research tends to focus on large-scale effects in cities, decision-makers may be unaware that those outcomes are not always generalizable across spatial scales.', NULL, 'Which choice best describes the overall structure of the text?', '{"A":"It outlines a problem that is of growing public concern, explains why an innovative solution to that problem is challenging to implement, and then suggests the importance of researching alternative solutions.","B":"It addresses an appealing approach to a prevalent problem, illustrates that the approach is not as uniformly successful as it may seem, and then further emphasizes the importance of recognizing nuances in the research on that approach.","C":"It details an initiative implemented in response to certain research findings, identifies an apparent inconsistency within those findings, and then explains how that inconsistency has typically been accounted for.","D":"It establishes the growing intensity of a public concern, details the most common method of mitigating that concern, and then refers to evidence that the method is broadly ineffective."}'::jsonb, NULL, 'B', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '1-7', 7, 'mcq', 'The Skin I''m In was Sharon G. Flake''s debut novel. It was published in 1998. A debut novel is the first book that an author has published. Debut novels are especially interesting to literary critics (people whose job it is to evaluate books) and readers because these books offer a look at new voices in the literary world.', NULL, 'According to the text, what is someone who professionally evaluates books called?', '{"A":"A bookseller","B":"An author","C":"A literary critic","D":"A book publisher"}'::jsonb, NULL, 'C', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '1-8', 8, 'mcq', 'The following text is adapted from L. M. Montgomery''s 1923 novel Emily of New Moon.
Emily, a young girl who lives on a farm run by her aunt Elizabeth, wants to be a published writer someday.
 One of the things they [argued] about was the fact that Emily, as Aunt Elizabeth discovered one day, was in the habit of using more of her egg money to buy paper than Aunt Elizabeth approved of. What did Emily do with so much paper? They had a fuss over this and eventually Aunt Elizabeth discovered that Emily was writing stories. Emily had been writing stories all winter under Aunt Elizabeth''s very nose and Aunt Elizabeth had never suspected it. She had fondly supposed that Emily was writing school compositions.', NULL, 'Which choice best states the main idea of the text?', '{"A":"Emily forgot to buy eggs when she was supposed to.","B":"Aunt Elizabeth thinks Emily should spend more time at school.","C":"Aunt Elizabeth is surprised to find out that Emily has been writing stories.","D":"Emily is relieved to learn that Aunt Elizabeth enjoys reading Emily''s stories."}'::jsonb, NULL, 'C', NULL, NULL, 9)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '1-9', 9, 'mcq', 'Average Hours Worked per Person per Year in 1950 and 2017

Country | 1950 | 2017 | Change in hours | Percent change in hours
Peru | 2,157 | 1,932 | -225 | -10%
Canada | 2,209 | 1,696 | -513 | -23%
Denmark | 2,049 | 1,400 | -649 | -32%
Finland | 2,053 | 1,659 | -394 | -19%

A student in an economics course is examining the decline since 1950 in average hours worked per person per year in various nations due to both increased productivity and the adoption of policies that limit working hours. The first task in this investigation is to determine how the decline in Finland compares to that in other countries. The student finds that ______.', NULL, 'Which choice most effectively uses data from the table to complete the student''s conclusion?', '{"A":"the percent decrease in hours worked was greater in Finland than it was in Denmark, Canada, or Peru.","B":"though the decline in number of hours worked in Finland was less than that in Denmark and Canada, it was greater than that in Peru.","C":"while the number of hours worked rose in Finland between 1950 and 2017, it declined in Denmark, Canada, and Peru.","D":"though the decline in number of hours worked in Finland was greater than that in Denmark and Peru, it was less than that in Canada."}'::jsonb, NULL, 'B', NULL, NULL, 10)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '1-10', 10, 'mcq', 'Percent Change in Average Global Market Prices by Commodity in Two Agricultural Trade-Reform Scenarios

Commodity | Percent change in TFA scenario | Percent change in tariff-removal scenario
Fruits and vegetables | -1.50 | +0.04
Processed foods | -1.76 | -1.00
Rice | -0.37 | +1.36
Wheat | -1.35 | +0.45

Ratified in 2017 by two-thirds of World Trade Organization member nations, the Trade Facilitation Agreement (TFA) is a trade-reform measure that aims to reduce redundant customs procedures and other costly aspects of international trade. In a 2021 report, economist Jayson Beckman modeled global market prices of several agricultural commodities under both the TFA and an alternative trade-reform scenario: removal of agricultural tariffs (taxes on imports that generally increase prices on imported goods). After reviewing data from the report, a student concludes that overall, consumers of the commodities listed in the table would likely benefit more from the TFA than they would from tariff removal.', NULL, 'Which choice most effectively uses data from the table to support the student''s claim?', '{"A":"Under the tariff-removal scenario, the average prices of processed foods, wheat, and fruits and vegetables would decrease by more than 1%, while the average price of rice would decrease by less than 1%.","B":"Under the tariff-removal scenario, the average price of processed foods would increase, but the average prices of wheat and rice would decrease.","C":"Under the TFA scenario, the average prices of all four commodities would decrease, whereas under the tariff-removal scenario, only the average price of processed foods would decrease.","D":"Under the TFA scenario, the average price of rice would decrease by a smaller amount than any of the other three commodities'' prices would, whereas its average price would increase under the tariff-removal scenario."}'::jsonb, NULL, 'C', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '1-11', 11, 'mcq', 'Value, Cost, and Seigniorage of US Coins by Denomination, 2023

Denomination | Total value of units produced (in millions of dollars) | Gross cost (in millions of dollars) | Seigniorage (in millions of dollars) | Seigniorage per $1 issued (dollars)
One-cent | 41.4 | 127.4 | -86.0 | -2.08
Five-cent | 70.8 | 163.4 | -92.6 | -1.31
Ten-cent | 266.6 | 141.1 | 125.5 | 0.47
Quarter-dollar | 568.4 | 264.4 | 304.0 | 0.53

Issuing a one-dollar coin yields positive seigniorage—the profit generated when the face value of a coin exceeds the unit cost of producing it—for Singapore''s government, which in turn can be used to fund such services as transportation. Some countries, such as the Netherlands, have ceased manufacturing certain coins because their production created negative seigniorage. In an economics class discussing the data in the table, one student argues that in 2023, the one-cent coin was the least financially sensible for the US to produce, while another student argues that the five-cent coin was.', NULL, 'Based on the information in the text and the table, the two students most likely disagree about the answer to which question?', '{"A":"When evaluating the financial implications of issuing a coin, which is more important, the total seigniorage from issuing that coin or the seigniorage per dollar when issuing that coin?","B":"If issuing a given coin results in negative seigniorage per dollar issued, can that be changed to positive seigniorage per dollar issued by reducing the cost of issuing the coin?","C":"If issuing a given coin results in positive seigniorage per dollar but not as much positive seigniorage per dollar as issuing a different coin does, does it make financial sense to continue issuing the first coin?","D":"When determining whether it makes financial sense to issue a given coin, which is more important, the total value of the units of that coin produced or the gross cost of issuing that coin?"}'::jsonb, NULL, 'A', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '1-12', 12, 'mcq', 'Describing adverbs as "silly," novelist Chuck Palahniuk is one of several authors and literary critics who have recommended minimizing the use of adverbs, especially those ending in -ly (e.g., "graciously"), in works of fiction. To investigate the prevalence of -ly adverbs in novels, author and statistician Ben Blatt used natural language processing—machine learning technology that reads and interprets text—to calculate the rates at which these words occur in the novels of William Faulkner, who was awarded the Nobel Prize in Literature in 1949. Blatt concluded that in Faulkner''s oeuvre, there is a negative correlation between -ly adverb proliferation and perceived literary merit.', NULL, 'Which finding, if true, would most directly illustrate the pattern Blatt identified?', '{"A":"Whereas Faulkner''s acclaimed novel The Sound and the Fury has one of the lowest -ly adverb rates among Faulkner''s works, F. Scott Fitzgerald''s classic novel The Great Gatsby has the lowest -ly adverb rate among Fitzgerald''s novels.","B":"In The Sound and the Fury, which is widely recognized as a literary masterpiece, Faulkner used 42 -ly adverbs per 10,000 words, whereas in his less-acclaimed novel Soldiers'' Pay, Faulkner used 148 -ly adverbs per 10,000 words.","C":"In his celebrated novel Light in August, Faulkner used 67 -ly adverbs per 10,000 words, whereas 67% of celebrated authors'' novels that have fewer than 50 -ly adverbs per 10,000 words have been classified as great by critics.","D":"Whereas Faulkner used on average 92 -ly adverbs per 10,000 words in the 19 novels of Faulkner''s that Blatt investigated, Toni Morrison, winner of the 1993 Nobel Prize in Literature, used on average 76 -ly adverbs per 10,000 words in her novels."}'::jsonb, NULL, 'B', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '1-13', 13, 'mcq', 'Students in a biology class investigated why individual house mice (Mus musculus) can differ from one another in their circulating sodium level. The students compared wild-type mice and knockout mice, which are mice with specific genes deactivated, when mice of each type were placed in similar naturalistic environments and taken for periodic blood sampling. Finding that knockout mice with the gene Asb5 deactivated tended to have lower concentrations of sodium in their blood than did wild-type mice, the students concluded that differences in circulating sodium level among house mice in nature are solely attributable to variations in the level of expression of Asb5.', NULL, 'Which finding, if true, would most directly weaken the students'' conclusion?', '{"A":"Some wild-type mice were very similar to the knockout mice with regard to circulating sodium level but showed a wide variety of levels of expression of Asb5.","B":"A sampling of house mice captured in natural settings shows that individual mice can differ from one another in the level of expression of Asb5.","C":"The level of expression of Asb5 does not appear to affect the functioning of any other genes in house mice.","D":"The mice with Asb5 deactivated were identical to the wild-type mice except with regard to circulating sodium level."}'::jsonb, NULL, 'A', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '1-14', 14, 'mcq', 'Neuroscientist Artin Arshamian and his team sought to determine what affects a person''s perception of an odor as pleasant: is it culture, personal taste, or aspects of human anatomy? The team assessed odor preferences in ten groups of people with different modes of living (urban, agricultural, and hunter-gatherer) including urban dwellers from a large city in Thailand and Chachi people from a small community in Ecuador. The team observed that across cultures, people generally rated odors about the same: vanillin, which smells like vanilla, was typically rated more pleasant than isovaleric acid, which smells like human sweat. The team therefore concluded that ______.', NULL, 'Which choice most logically completes the text?', '{"A":"a person who lives in an urban area is more likely to encounter the odor of vanillin than is a person who lives in a small community.","B":"a person''s mode of living likely doesn''t have a large influence on that person''s perception of whether an odor is pleasant or unpleasant.","C":"a person who perceives certain odors as pleasant will likely perceive the odors as roughly equal in pleasantness.","D":"culture likely plays more of a role in a person''s perception of how pleasant an odor is than does human anatomy."}'::jsonb, NULL, 'B', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '1-15', 15, 'mcq', 'The towns Entebbe and Jamame are both located almost directly on the ______ they are in different countries. Entebbe is in Uganda, while Jamame is in Somalia.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"equator","B":"equator, but","C":"equator,","D":"equator that"}'::jsonb, NULL, 'B', NULL, NULL, 16)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '1-16', 16, 'mcq', 'Having trained as astronauts for years, ______', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"August 2, 1991, was when space shuttle Atlantis took flight with five crew members aboard.","B":"it was August 2, 1991, when five crew members took flight aboard space shuttle Atlantis.","C":"five crew members took flight aboard space shuttle Atlantis on August 2, 1991.","D":"space shuttle Atlantis took flight on August 2, 1991, with five crew members aboard."}'::jsonb, NULL, 'C', NULL, NULL, 17)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '1-17', 17, 'mcq', 'In 1991, New Jersey ______ official fossil: the Hadrosaurus foulkii, which is a Cretaceous period dinosaur.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"lawmakers designated the state''s","B":"lawmakers designated the states","C":"lawmaker''s designated the states","D":"lawmaker''s designated the state''s"}'::jsonb, NULL, 'A', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '1-18', 18, 'mcq', 'Nicosia is home to roughly 27 percent of Cyprus''s total population. This means that about 1 in 4 ______ live in Cyprus live in Nicosia!', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"people","B":"people who","C":"people,","D":"people, who"}'::jsonb, NULL, 'B', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '1-19', 19, 'mcq', 'In the Persian language, people commonly begin a folktale with a phrase that roughly translates to "there was and there was not." In English, beginning with the phrase "once upon a time" is common. Indeed, how a folktale begins depends largely on the language in which ______ being told.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"they were","B":"these are","C":"they are","D":"it is"}'::jsonb, NULL, 'D', NULL, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '1-20', 20, 'mcq', 'Thraxas by Martin Scott, Richard Matheson: Collected Stories by Richard Matheson, and Strange Tales by Rosalie Parker are all pieces of literature that have won the prestigious World Fantasy ______ the works received the honor in the categories of novel, collection, and anthology, respectively.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"Award","B":"Award;","C":"Award and","D":"Award,"}'::jsonb, NULL, 'B', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '1-21', 21, 'mcq', 'Enacted in 1868, Luxembourg''s 5,601-word constitution, in contrast to Canada''s, which was enacted in 1867 and contains a far greater number (19,565) of words, ______ as the 9th shortest in the world. Such data are studied by constitutional scholars like Giovanni Sartori, who can use them to draw broader conclusions.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"rank","B":"are ranking","C":"ranks","D":"have ranked"}'::jsonb, NULL, 'C', NULL, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '1-22', 22, 'mcq', 'If you were to view the Namarunu volcano in Kenya from above, you might notice that its low profile and gently sloping sides make it look a bit like a shield lying flat on the ground. ______ it makes sense that Lydia Jennings and other volcanologists classify Namarunu as a shield volcano.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"For instance,","B":"Therefore,","C":"However,","D":"By contrast,"}'::jsonb, NULL, 'B', NULL, NULL, 23)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '1-23', 23, 'mcq', 'While researching a topic, a student has taken the following notes:
• Jane is the nickname of a dinosaur fossil specimen housed at the Burpee Museum of Natural History.
• The Burpee Museum of Natural History is located in Rockford, Illinois.
• Jane is a member of the genus Tyrannosaurus.
• Big Mike is the nickname of a dinosaur fossil specimen housed at the Museum of the Rockies.
• The Museum of the Rockies is located in Bozeman, Montana.
• Big Mike is a member of the genus Tyrannosaurus.', NULL, 'The student wants to emphasize a similarity between the two specimens. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"While Jane is housed at the Burpee Museum of Natural History, Big Mike is housed at the Museum of the Rockies.","B":"The dinosaur fossil specimens Jane and Big Mike are both members of the genus Tyrannosaurus.","C":"Big Mike is the nickname of a Tyrannosaurus fossil specimen housed at the Museum of the Rockies in Bozeman, Montana.","D":"The Burpee Museum of Natural History, where Jane is housed, is located in Rockford, Illinois."}'::jsonb, NULL, 'B', NULL, NULL, 24)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '1-24', 24, 'mcq', 'While researching a topic, a student has taken the following notes:
• The Incarnations (2015) is an epistolary novel by English author Susan Barker.
• Epistolary novels are novels written primarily as a series of fictional documents.
• These documents can be letters, journal entries, newspaper clippings, and more.
• The Incarnations consists primarily of letters.
• The letters are sent between a taxi driver named Wang Jun and a mysterious woman.', NULL, 'The student wants to define the term "epistolary novel." Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Consisting primarily of letters sent between a taxi driver named Wang Jun and a mysterious woman, Susan Barker''s The Incarnations is an epistolary novel.","B":"Susan Barker''s novel The Incarnations was published in 2015 and consists primarily of letters sent between a taxi driver named Wang Jun and a mysterious woman.","C":"An epistolary novel is a novel written primarily as a series of fictional documents, such as letters, journal entries, or newspaper clippings.","D":"Published in 2015, The Incarnations is an epistolary novel by English author Susan Barker."}'::jsonb, NULL, 'C', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '1-25', 25, 'mcq', 'While researching a topic, a student has taken the following notes:
• The Future of Nostalgia is a scholarly book by literary theorist Svetlana Boym.
• The book provides a multifaceted exploration of the concept of nostalgia.
• Chapter 8 explores nostalgia and Europe''s largest shopping mall.
• Chapter 17 discusses various skeptics, takes on the concept of nostalgia.
• In chapter 17, Boym writes, "The poethics of nostalgia combines estrangement and human solidarity, affect and reflection."', NULL, 'The student wants to provide a quotation from chapter 17. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"After exploring nostalgia and Europe''s largest shopping mall, Svetlana Boym goes on to discuss various skeptics'' takes on the concept of nostalgia.","B":"Svetlana Boym''s The Future of Nostalgia provides a multifaceted exploration of the concept of nostalgia.","C":"Svetlana Boym explores nostalgia and Europe''s largest shopping mall in chapter 8 of her book.","D":"In an exploration of various skeptics'' takes on the concept of nostalgia, Svetlana Boym writes, \"The poethics of nostalgia combines estrangement and human solidarity, affect and reflection.\""}'::jsonb, NULL, 'D', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '1-26', 26, 'mcq', 'While researching a topic, a student has taken the following notes:
• Urban natural areas are city spaces that feature elements of nature.
• Facade-bound green walls are urban natural areas defined as exterior walls that have plants growing on them.
• They can benefit cities by enhancing air quality.
• Urban grasslands are urban natural areas defined as areas of pastures or meadows in cities.
• They can benefit cities by increasing diversity among bird species.', NULL, 'The student wants to emphasize a similarity between facade-bound green walls and urban grasslands. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Urban grasslands, which are areas of pastures or meadows in cities, benefit cities by increasing diversity among bird species.","B":"Facade-bound green walls enhance air quality, whereas urban grasslands increase diversity among bird species.","C":"Facade-bound green walls and urban grasslands can both be considered urban natural areas.","D":"By enhancing air quality, facade-bound green walls benefit cities."}'::jsonb, NULL, 'C', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '1-27', 27, 'mcq', 'While researching a topic, a student has taken the following notes:
• When the electrons of a chemical element change energy states, certain wavelengths of light are released.
• This unique collection of wavelengths is known as the emission spectrum of the element.
• Magnesium''s emission spectrum includes the 517.2 nanometer (nm) wavelength.
• Helium''s emission spectrum includes the 587.5 nm wavelength.
• The green portion of the visible spectrum is made up of light with wavelengths of 500-570 nm.', NULL, 'The student wants to identify an emission spectrum that includes a wavelength in the green portion of the visible spectrum. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Containing the 517.2 nm and 587.5 nm wavelengths, respectively, both magnesium''s and helium''s emission spectra include wavelengths in the green portion of the visible spectrum.","B":"Magnesium''s emission spectrum includes the 517.2 nm wavelength, which is in the green portion of the visible spectrum.","C":"The 587.5 nm wavelength, which is in the green portion of the visible spectrum, is one wavelength in the emission spectrum of helium.","D":"Since the 517.2 nm wavelength of light is within the 500-570 nm range, it is part of the green portion of the visible spectrum."}'::jsonb, NULL, 'B', NULL, NULL, 28)
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
  VALUES (v_mod, 1, '2-1', 1, 'mcq', 'In New Zealand, France, and other countries with strong democratic institutions, the state tends to exert relatively little direct control over economic performance. Though this may seem to ______, the state''s ability to curb inflation, Raj Desai et al. have shown that strongly democratic states can and do deploy effective counter inflationary policies.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"hamper","B":"extort","C":"underscore","D":"impugn"}'::jsonb, NULL, 'A', NULL, NULL, 30)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '2-2', 2, 'mcq', 'Although the clustering of cutlery manufacturing firms in Sheffield, UK, is often cited as typical of industrial agglomeration, Giulia Faggio et al. use UK data to show that the mix of factors driving the phenomenon is ______ across industries: while access to specialized suppliers can prompt agglomeration, collocation among refined petroleum product manufacturers occurs for different reasons.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"imperative","B":"credible","C":"heterogeneous","D":"decisive"}'::jsonb, NULL, 'C', NULL, NULL, 31)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '2-3', 3, 'mcq', 'Studying wrappers from discontinued candies, cover images from out-of-print magazines, and posters promoting concerts by long-forgotten musicians may seem like a frivolous pursuit, but ephemeral objects like these are useful as ______ cultural change, revealing shifts in norms, values, and concerns that traditional objects of historical inquiry may not.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"pretexts for","B":"conjectures about","C":"manifestations of","D":"inducements to"}'::jsonb, NULL, 'C', NULL, NULL, 32)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '2-4', 4, 'mcq', 'The 2023 anthology The Big Book of Cyberpunk contains 108 stories, including Fritz Leiber''s "Coming Attraction" (1950) and Erica Satifka''s "Act of Providence" (2021). With its chronological scope, it is more comprehensive than the much shorter 1986 cyberpunk anthology Mirrorshades, but Mirrorshades''s careful selection of stories makes that anthology more ______.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"capacious","B":"outmoded","C":"cursory","D":"discerning"}'::jsonb, NULL, 'D', NULL, NULL, 33)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '2-5', 5, 'mcq', 'The following text is from William Carlos Williams''s 1925 creative nonfiction book In the American Grain. Williams is discussing how works by nineteenth-century US poet and fiction writer Edgar Allan Poe were received by American readers.

Poe must suffer by his originality. Invent that which is new, even if it be made of pine from your own yard, and there''s none to know what you have done. It is because there''s no name. This is the cause of Poe''s lack of recognition. He was American. He was the astounding, inconceivable growth of his locality.', NULL, 'As used in the text, what does the underlined figurative phrase most nearly mean?', '{"A":"Personal experiences that are hard for others to comprehend","B":"Ideas you have never previously expressed","C":"Elements of the culture in which you live","D":"Inspiration you received while reading independently"}'::jsonb, NULL, 'C', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '2-6', 6, 'mcq', 'To prevent excessive microbial growth in the closed habitat of the International Space Station, relative humidity is carefully maintained. Nonetheless, Veillonella parvula and other bacteria, which have the potential to damage spacecraft materials, can ______ when routine crew-member activities (e.g., handwashing) produce localized humidity conditions that exceed the specified maximum for the station overall.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"abate","B":"recalibrate","C":"proliferate","D":"rehabilitate"}'::jsonb, NULL, 'C', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '2-7', 7, 'mcq', 'In Tunica, an Indigenous language from the lower Mississippi Valley in what is now the United States, mili means "red," whereas milimita is used to refer to several red things. This phenomenon, in which an element of a root word is repeated, sometimes with modification, within another word that is related to the root word, is called reduplication. In this case, the entire word mili gets repeated in milimita. There are many examples of this type of reduplication in Tunica.', NULL, 'Which choice best describes the overall structure of the text?', '{"A":"It presents some specific words in Tunica, describes the general linguistic phenomenon exemplified by those words, and then states that this phenomenon occurs frequently in Tunica.","B":"It identifies the most frequently occurring words in Tunica, explains why it is difficult to translate those words into English, and then provides examples of languages other than English into which those words can be translated.","C":"It explains the phenomenon of reduplication, discusses why reduplication has been controversial among scholars, and then argues that an analysis of Tunica could help resolve that controversy.","D":"It describes the relationship between Tunica and several other languages, raises a question about the nature of that relationship, and then answers that question."}'::jsonb, NULL, 'A', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '2-8', 8, 'mcq', 'The Truslow, first published in 1992, is a novel in Patrick O''Brian''s Aubrey/Maturin series, which includes twenty books plus an unfinished fragment of a twenty-first. Some critics have found fault with the abrupt endings of The Truslow and other books in the series, saying that they do not finish conclusively but arbitrarily stop. But other critics argue that the books should not be thought of as discrete texts with traditional beginnings and endings but as a single incredibly long work, similar to other multivolume stories, such as Anthony Powell''s A Dance to the Music of Time.', NULL, 'Which choice best describes the function of the underlined portion in the text as a whole?', '{"A":"It explains why many critics find the Aubrey/Maturin novels to be entertaining despite flaws in the novels'' structures.","B":"It argues that the unusual structure that O''Brian uses for The Truslow makes it one of his least entertaining books.","C":"It presents a reason most critics think the Aubrey/Maturin series should not have the literary renown of similar works like A Dance to the Music of Time.","D":"It describes a characteristic of the Aubrey/Maturin novels and summarizes a negative assessment of it."}'::jsonb, NULL, 'D', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '2-9', 9, 'mcq', 'Text 1
In separate studies, Marine Fernandez and colleagues and Xinhua He and colleagues examined whether plants transfer nutrients to one another using a common mycorrhizal network (CMN)—a lattice of fungal strands in the soil. Fernandez and colleagues excluded all pathways other than the CMN by using barriers to keep the plants'' root systems separate while allowing mycorrhizal strands through—a crucial step He and colleagues'' study did not take.

Text 2
Fernandez and colleagues took the necessary precaution of separating the plants'' root systems (thereby excluding root-to-root transmission). However, any barrier used must allow the thread-like hyphae of a CMN to pass through, and this permeability would also allow liquids through. Thus, the researchers'' experimental design cannot ensure that any nutrient transfer observed can be attributed to a CMN and not to some other pathway.', NULL, 'Based on the texts, which choice best describes a similarity in the points of view presented in Text 1 and Text 2?', '{"A":"Each text attempts to dispel a common misunderstanding about the likelihood of plant-to-plant nutrient transfer.","B":"Each text assumes that most nutrient transfer between plants is via a CMN.","C":"Each text analyzes methods for studying CMN nutrient transfer in order to propose an alternative method of study.","D":"Each text critiques the methodology of a study about nutrient transfer via a CMN."}'::jsonb, NULL, 'D', NULL, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '2-10', 10, 'mcq', 'Founded in 1996, the Museum of Latin American Art showcases modern and contemporary art by Latin American artists and Latino artists in the United States. It is located in Long Beach, California, and has more than 1,300 objects in its collection. Since 2000, a number of other institutions devoted to Latino cultures have opened in the United States. A notable example is LA Plaza de Culturay Artes in Los Angeles. It focuses on Mexican American art and culture.', NULL, 'Which choice best states the main topic of the text?', '{"A":"The history of Los Angeles","B":"The decline in the number of people attending museums","C":"Latino cultural institutions in the United States","D":"The geography of Latin America"}'::jsonb, NULL, 'C', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '2-11', 11, 'mcq', 'Argyroxiphium caliginis is among the twenty-eight species of silversword plants found only on the Hawaiian archipelago that collectively illustrate the process of adaptive radiation, or the rapid diversification of an ancestral species into different, related species. Each silversword species is physically distinct, with mature plant forms ranging from trees and shrubs to vines. However, they all descended from a common tarweed plant species, with their unique physical characteristics emerging as they adapted to the archipelago''s many specific habitats over time.', NULL, 'Which choice best states the main idea of the text?', '{"A":"Most plants that grow on the Hawaiian archipelago are descendants of a single founder species.","B":"All silverswords that grow on the Hawaiian archipelago have similar physical characteristics.","C":"The Hawaiian archipelago exhibits many distinct habitats and species.","D":"Silverswords are good examples of adaptive radiation on the Hawaiian archipelago."}'::jsonb, NULL, 'D', NULL, NULL, 40)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '2-12', 12, 'mcq', 'The bird species Piculus flavigula (the yellow-throated woodpecker), which forages in relatively dense vegetation, and Willsonis poecilinotus (the common scale-backed antbird), which forages in open areas or low density vegetation, share territory in French Guiana with Thamnomanes caesius (the cinereous antshrike), which emits a loud alarm call when it detects predators. Biologist Ari Martinez and colleagues, who studied the ecological community the species share, hypothesized that there is an inverse relationship between birds'' field of vision while foraging and their sensitivity to alarm calls from neighboring species.', NULL, 'Which finding, if true, would most directly support Martinez and colleagues'' hypothesis?', '{"A":"W. poecilinotus displayed no reaction when Martinez and colleagues played T. caesius alarm calls, whereas P. flavigula displayed predator-avoidance behavior in response to the calls.","B":"Many local bird species with similar foraging habits to those of P. flavigula displayed no reaction when Martinez and colleagues played T. caesius alarm calls, whereas P. flavigula displayed predator-avoidance behavior.","C":"Some individuals of W. poecilinotus displayed predator-avoidance behavior when Martinez and colleagues played T. caesius alarm calls, whereas nearly all did when P. flavigula alarm calls were played.","D":"When Martinez and colleagues played T. caesius alarm calls, P. flavigula and W. poecilinotus displayed no reaction, whereas T. caesius displayed predator-avoidance behavior."}'::jsonb, NULL, 'A', NULL, NULL, 41)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '2-13', 13, 'mcq', 'Nautiloids are marine mollusks that begin growing their shells before emerging from their eggs and continue to add shell segments throughout their lifetimes. The walls between their shells'' chambers are called septa, and the deeper the water in which a septum forms, the greater the concentration of the isotope oxygen-18 the septum will contain. Since temperature falls as depth increases, if the area of ocean a nautiloid inhabits is known, this isotopic signature can reveal the temperature at which its septa formed. Paleontologist Amane Tajika and colleagues examined each of the septa in two nautiloid shells and concluded that septum sample M20 formed at a temperature of 15.2 °C whereas sample F04 formed at 22.5 °C.', NULL, 'Which finding, if true, would most directly weaken the researchers'' conclusion?', '{"A":"At a depth of 355 meters in the nautiloids'' habitat, the water is 15.2 °C and the concentration of oxygen-18 is equal to that in sample M20.","B":"The concentration of oxygen-18 in F04 is lower than that in M20.","C":"The concentration of oxygen-18 in F04 is higher than that in M20.","D":"At a depth of 90 meters in the nautiloids'' habitat, the water is 22.5 °C and the concentration of oxygen-18 is equal to that in sample F04."}'::jsonb, NULL, 'C', NULL, NULL, 42)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '2-14', 14, 'mcq', 'Average Ratings of Perceived Personality Traits of Dogs and Human Willingness to Keep or Interact with Them

Image ID | Irises | Not friendly (0)-Friendly (5) | Immature (0)-Mature (5) | Would not keep (0)-Would keep (3) | Would not interact with (0)-Would interact with (3)
24 | light | 2.67 | 4.03 | 1.4 | 1.7
14 | light | 2.11 | 3.27 | 1.55 | 1.85
8 | dark | 3.52 | 2.91 | 1.9 | 2.45
3 | dark | 3.88 | 2.51 | 2.05 | 2.65

Interested in how differences in the color of dogs'' irises affect human responses to dogs, Akitsugu Konno et al. showed close-up images of dogs'' faces to human participants and asked them to rate the dogs'' traits and their own attitudes toward the dogs. Konno et al. suggest that differences in iris color led participants to view some dogs as more vulnerable and in need of protection than others and that this phenomenon could help explain the association the researchers observed between iris color and participants'' inclinations to interact with or keep dogs, as illustrated by the finding that ______', NULL, 'Which choice most effectively uses data from the table to complete the statement?', '{"A":"participants rated the dog in image 3 as more mature than the dog in image 8 and rated the dog in image 14 as less mature than the dog in image 24.","B":"dogs that participants rated as friendlier were also dogs that participants indicated a stronger willingness to interact with or keep.","C":"the more mature a dog was perceived to be, the more likely participants were to rate it as having light irises.","D":"participants favored the dogs in images 3 and 8, which they rated as less mature than the dogs in images 24 and 14."}'::jsonb, NULL, 'D', NULL, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '2-15', 15, 'mcq', 'Anthropogenic noise (sounds from human sources like traffic or mining) can affect animals, as Soledad Lucia Uran and colleagues found in a 2012 study of brown rats. A meta-analysis of more than 100 such studies examining various species found that, for every study, relevant traits or behaviors of the animals were observably different between the exposed group and the otherwise similar but unexposed group, regardless of whether that difference was beneficial or detrimental for the exposed group. So while a study of birds might show a difference that benefits the exposed group, and a study of mammals might show a difference that''s harmful to the exposed group, both differences are substantial. Therefore, the results of the meta-analysis suggest that ______', NULL, 'Which choice most logically completes the text?', '{"A":"exposure to anthropogenic noise will likely have noticeable effects both on mammals such as brown rats and on birds such as reed buntings, but the nature of that effect could be very different for the two species.","B":"the studies of the birds likely found significantly larger effects of exposure to anthropogenic noise than most studies of mammals except the study of brown rats by Soledad Lucia Uran and colleagues.","C":"the studies in the meta-analysis that examined mammals were more likely than those about birds to specify whether the observed effects were detrimental.","D":"the study conducted by Soledad Lucia Uran and colleagues found substantial differences, but studies included in the meta-analysis of mammals other than brown rats likely did not."}'::jsonb, NULL, 'A', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '2-16', 16, 'mcq', 'To measure changes in parasite abundance over time, Chelsea Wood and colleagues counted parasite individuals preserved on specimens of striped sea perch, surf smelt, and six other fish species collected from Puget Sound between 1880 and 2019. Using statistical models to estimate historical populations, the researchers determined that for every 1°C increase in annual average sea surface temperature, the abundance of complex life cycle parasites like Lecithaster sp., which require at least three host species throughout their life cycle, decreased by 38%. However, the abundance of Bomolochus bellones and other directly transmitted parasites, which require only one host species, was essentially unchanged. These findings suggest that ______', NULL, 'Which choice most logically completes the text?', '{"A":"Lecithaster sp. abundance decreased by 38% over the period studied, whereas B. bellones abundance did not.","B":"parasites that rely exclusively on either striped sea perch or surf smelt are more sensitive to rising temperatures than are parasites that can infect both species throughout their life cycles.","C":"dependency on only a single host species may confer on parasites some resilience to rising sea surface temperatures.","D":"as the number of hosts that complex life cycle parasites require increases, the parasites'' tolerance for rising sea surface temperatures decreases proportionally."}'::jsonb, NULL, 'C', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '2-17', 17, 'mcq', 'The historian''s books about Millard Fillmore ______ what she is best known for, but she is also well regarded for her scholarship on Thomas Jefferson.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"is","B":"are","C":"has been","D":"was"}'::jsonb, NULL, 'B', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '2-18', 18, 'mcq', 'Disyllabic words ______ as trochees in English metrical verse, such as "eyebrow" and "mascot," consist of one stressed syllable followed by one unstressed syllable.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"have been classified","B":"can be classified","C":"are classified","D":"classified"}'::jsonb, NULL, 'D', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '2-19', 19, 'mcq', 'All member nations of the North Atlantic Treaty Organization, or NATO—including Belgium, which joined in 1949; Hungary, which joined in 1999; and Slovenia, which joined in ______ are committed to NATO''s principle of collective defense, each member pledging to defend all others.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"2004;","B":"2004","C":"2004—","D":"2004,"}'::jsonb, NULL, 'C', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '2-20', 20, 'mcq', 'As the exoplanet 81 Cetib orbits a star 330 light-years from Earth, the exoplanet''s gravity causes the star to wobble. In 2008, astronomers ______ this wobble through shifts in the color of the star''s spectral light—blueshifts indicating longer wavelengths and movement toward the observer, redshifts shorter wavelengths and movement away—deduced that the fluctuation was caused by the gravitational force of a previously undetected exoplanet.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"perceived","B":"had perceived","C":"were perceiving","D":"perceiving"}'::jsonb, NULL, 'D', NULL, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '2-21', 21, 'mcq', 'A loose confederation of cities from eleven modern-day countries, the Hanseatic League was a powerful mercantile alliance that dominated northern European trade between the 13th and 17th centuries. Hanseatic League member ______ was serendipitously located on the Rhine River in Germany, giving Cologne''s merchants access to key maritime trade routes.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"city Cologne,","B":"city, Cologne,","C":"city, Cologne","D":"city Cologne"}'::jsonb, NULL, 'D', NULL, NULL, 50)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '2-22', 22, 'mcq', 'The moon Dia orbits Jupiter in the same direction that the planet rotates. ______ Dia''s orbit is described as prograde. Erinome, another of Jupiter''s moons, orbits in the opposite direction, so its orbit is described with the opposite term: retrograde.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"However,","B":"Thus,","C":"Likewise,","D":"Next,"}'::jsonb, NULL, 'B', NULL, NULL, 51)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '2-23', 23, 'mcq', 'Scientists studying asteroid deflection have focused on secondary objects such as S/2015 (190208), a moonlet orbiting the near-Earth asteroid 2006 AQ. In 2022 NASA intentionally crashed a probe into just such an object, successfully altering its orbit. Scientists have yet to demonstrate, ______ that 2006 AQ and other primary objects would be similarly affected.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"for example,","B":"admittedly,","C":"moreover,","D":"likewise,"}'::jsonb, NULL, 'B', NULL, NULL, 52)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '2-24', 24, 'mcq', 'Many paintings of the trompe l''oeil genre attain their illusory verisimilitude by depicting quotidian things, such as a fly or an empty bird cage, as if they are placed directly on top of the painted canvas. Nicola van Houbraken''s 1700 trompe l''oeil Portrait of François Rivière. ______ startles the viewer with the extraordinary sight of a man appearing to poke his head out from within the picture frame.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"fittingly,","B":"by contrast,","C":"for instance,","D":"specifically,"}'::jsonb, NULL, 'B', NULL, NULL, 53)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '2-25', 25, 'mcq', 'While researching a topic, a student has taken the following notes:
• Katrin Heer, Larissa Albrecht, and Elisabeth K. V. Kalko published a study in 2010.
• In it, the researchers found that ingestion by bats had a neutral effect on the germination of Ficus nymphaefolia plant seeds.
• Mikaela Marques Pulzatto and M. S. Dainez Filho published a study in 2017.
• In it, the researchers found that ingestion by bats had a negative effect on the germination of Ficus luschnathiana plant seeds.
• Reinaldo Chaves Teixeira, C. Corrêa, and E. Fischer published a study in 2009.
• In it, the researchers found that ingestion by bats had a positive effect on the germination of Ficus pertusa plant seeds.', NULL, 'The student wants to make a generalization about the germination of seeds ingested by bats. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Bat ingestion has consistently been found to have a positive effect on seed germination.","B":"As was found in the 2010 study, ingestion by bats has a positive effect on the germination of plant seeds.","C":"Over the years, researchers have studied the effect that seed germination has had on ingestion by bats.","D":"Seed ingestion by bats can have varying effects on seed germination."}'::jsonb, NULL, 'D', NULL, NULL, 54)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '2-26', 26, 'mcq', 'While researching a topic, a student has taken the following notes:
• Waiting is a 1987 black-and-white linocut print by Kuwaiti artist Thuraya Al-Baqsami.
• It depicts a tranquil, everyday scene: a woman in a headscarf gazing out a window.
• ¡Sera toda nuestra! ("It will all be ours!") is a 1977 color linocut print by Mexican American artist Carlos Cortéz.
• It features a group of laborers preparing to go on strike.
• Lino cutting is an inexpensive printmaking technique in which an image is carved onto linoleum tile, covered in ink or paint, and stamped onto paper.', NULL, 'The student wants to make a generalization about linocut prints. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Linocuts can depict a range of scenes, from the explicitly political to the tranquil and everyday.","B":"Cortéz''s linocut features a group of laborers preparing to go on strike, while Al-Baqsami''s depicts a woman in a headscarf gazing out a window.","C":"Cortéz made ¡Sera toda nuestra! (\"It will all be ours!\") in 1977, while Al-Baqsami made Waiting later, in 1987.","D":"Lino cutting is a printmaking technique in which linoleum tile is used to create works with an explicitly political point of view."}'::jsonb, NULL, 'A', NULL, NULL, 55)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
  INSERT INTO public.test_questions
    (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '2-27', 27, 'mcq', 'While researching a topic, a student has taken the following notes:
• Between the fifteenth and sixteenth centuries, the city of Timbuktu was part of the Songhai Empire.
• Timbuktu was a center of trade and scholarship in the Sahara desert.
• The city was known for its hundreds of thousands of written manuscripts on both secular and religious subjects.
• The manuscripts survive today in dozens of private libraries across the city.
• The Pearls Leading to Accepted Guidance is one of these manuscripts.', NULL, 'The student wants to introduce The Pearls Leading to Accepted Guidance to an audience unfamiliar with the Timbuktu manuscripts'' history. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Between the fifteenth and sixteenth centuries, the city of Timbuktu was home to The Pearls Leading to Accepted Guidance, a manuscript that discusses trade centers across the Sahara desert.","B":"In the city of Timbuktu, dozens of private libraries house manuscripts, such as The Pearls Leading to Accepted Guidance, that discuss both secular and religious subjects.","C":"The Pearls Leading to Accepted Guidance is a manuscript housed in a private library in Timbuktu.","D":"Among Timbuktu''s vast collection of secular and religious manuscripts dating back to the Songhai Empire is The Pearls Leading to Accepted Guidance."}'::jsonb, NULL, 'D', NULL, NULL, 56)
  ON CONFLICT (module_id, position) DO UPDATE
    SET ref = EXCLUDED.ref, number = EXCLUDED.number, type = EXCLUDED.type,
        passage = EXCLUDED.passage, passage_alt = EXCLUDED.passage_alt, stem = EXCLUDED.stem,
        choices = EXCLUDED.choices, figure = EXCLUDED.figure,
        correct_answer = EXCLUDED.correct_answer, accepted = EXCLUDED.accepted,
        domain = EXCLUDED.domain, source_page = EXCLUDED.source_page;
END $seed$;
