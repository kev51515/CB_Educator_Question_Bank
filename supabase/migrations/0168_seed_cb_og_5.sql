-- =============================================================================
-- Migration: 0168_seed_cb_og_5.sql
-- Purpose:   Seed "CB OG #5" (College Board linear Digital SAT practice test,
--            66 RW + 54 Math = 120 Q) into the full-test tables from 0048.
--   Source:  sat-practice-test-5-digital.pdf; official College Board answer key (pdf/Key/).
--   Idempotent upsert on (slug)/(test_id,position)/(module_id,position).
-- =============================================================================
DO $seed$
DECLARE v_test uuid; v_mod uuid;
BEGIN
  INSERT INTO public.tests (slug, ordinal, title, short_title, source, total_questions)
  VALUES ('cb-og-5', 11, 'CB OG #5', 'CB OG #5', 'sat-practice-test-5-digital.pdf', 120)
  ON CONFLICT (slug) DO UPDATE SET ordinal=EXCLUDED.ordinal, title=EXCLUDED.title,
    short_title=EXCLUDED.short_title, source=EXCLUDED.source, total_questions=EXCLUDED.total_questions
  RETURNING id INTO v_test;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 1, 'reading-writing', 'Reading and Writing — Module 1', 1920, 33)
  ON CONFLICT (test_id, position) DO UPDATE SET section=EXCLUDED.section, label=EXCLUDED.label,
    time_limit_seconds=EXCLUDED.time_limit_seconds, question_count=EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '1-1', 1, 'mcq', 'The following text is from the 1913 story “The King’s Coin” by Emily Pauline Johnson, a Kanienkahagen (Mohawk) writer also known as Tekahionwake. Fox-Foot, a young Ojibwe man, is guiding a group of fur traders who are traveling by canoe and suspects that they are being followed.

At supper time, Fox-Foot would allow no fire to be built, no landing to be made, no trace of their passing to be left. They ate canned meat and marmalade, drank again of the stream and pushed on, until just at dusk they reached the edge of a long, still lake, with shores of granite and dense fir forest.', NULL, 'As used in the text, what does the word “trace” most nearly mean?', '{"A":"Evidence","B":"Blemish","C":"Amount","D":"Sketch"}'::jsonb, NULL, 'A', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '1-2', 2, 'mcq', 'Many ancient sculptures of people’s heads are missing their noses. This is because the nose is the most ______ part of a sculpture of a person’s head. It is delicate and sticks out from the rest of the sculpture, making it especially easy to break.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"recognizable","B":"fragile","C":"common","D":"sophisticated"}'::jsonb, NULL, 'B', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '1-3', 3, 'mcq', 'K.D. Leka and colleagues found that the Sun’s corona provides an advance indication of solar flares—intense eruptions of electromagnetic radiation that emanate from active regions in the Sun’s photosphere and can interfere with telecommunications on Earth. Preceding a flare, the corona temporarily exhibits increased brightness above the region where the flare is ______.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"antecedent","B":"impending","C":"innocuous","D":"perpetual"}'::jsonb, NULL, 'B', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '1-4', 4, 'mcq', 'To demonstrate that the integrity of underground metal pipes can be assessed without unearthing the pipes, engineer Aroba Saleem and colleagues ______ the tendency of some metals’ internal magnetic fields to alter under stress: the team showed that such alterations can be measured from a distance and can reveal concentrations of stress in the pipes.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"hypothesized","B":"discounted","C":"redefined","D":"exploited"}'::jsonb, NULL, 'D', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '1-5', 5, 'mcq', 'Despite the generalizations about human behavior they have produced, many studies of behavioral psychology have used highly unrepresentative subject pools: students at the colleges and universities where the researchers are employed. To ______ this situation, it is necessary to actively recruit subjects from diverse backgrounds and locations.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"sanction","B":"ameliorate","C":"rationalize","D":"postulate"}'::jsonb, NULL, 'B', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '1-6', 6, 'mcq', 'The following text is adapted from Jean Webster’s 1912 novel <i>Daddy-Long-Legs</i>. The narrator is a young college student writing letters detailing her weekly experiences.

[The college is] organizing the Freshman basket-ball team and there’s just a chance that I shall make it. I’m little of course, but terribly quick and wiry and tough. While the others are hopping about in the air, I can dodge under their feet and grab the ball.', NULL, 'Which choice best states the main purpose of the text?', '{"A":"To compare basketball with other sports","B":"To provide details of how to play basketball","C":"To state how players will be chosen for the basketball team","D":"To explain why the narrator thinks she might make the basketball team"}'::jsonb, NULL, 'D', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '1-7', 7, 'mcq', 'In the late 1800s, Spanish-language newspapers flourished in cities across Texas. San Antonio alone produced eleven newspapers in Spanish between 1890 and 1900. But El Paso surpassed all other cities in the state. This city produced twenty-two newspapers in Spanish during that period. El Paso is located on the border with Mexico and has always had a large population of Spanish speakers. Thus, it is unsurprising that this city became such a rich site for Spanish-language journalism.', NULL, 'Which choice best states the main purpose of the text?', '{"A":"To compare Spanish-language newspapers published in Texas today with ones published there during the late 1800s","B":"To explain that Spanish-language newspapers thrived in Texas and especially in El Paso during the late 1800s","C":"To argue that Spanish-language newspapers published in El Paso influenced the ones published in San Antonio during the late 1800s","D":"To explain why Spanish-language newspapers published in Texas were so popular in Mexico during the late 1800s"}'::jsonb, NULL, 'B', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '1-8', 8, 'mcq', 'Chile’s Atacama Desert is one of the driest places on Earth. <u>Mary Beth Wilhelm and other astrobiologists search for life, or its remains, in this harsh place because the desert closely mirrors the extreme environment on Mars.</u> The algae and bacteria found in Atacama’s driest regions may offer clues about Martian life. By studying how these and other microorganisms survive such extreme conditions on Earth, Wilhelm’s team hopes to determine whether similar life might have existed on Mars and to develop the best tools to look for evidence of it.', NULL, 'Which choice best describes the function of the underlined sentence in the text as a whole?', '{"A":"To contrast the conditions in the Atacama Desert with those on Mars","B":"To explain why many life-forms cannot survive in the Atacama Desert","C":"To indicate why astrobiologists choose to conduct research in the Atacama Desert","D":"To describe certain limitations to conducting scientific study in the Atacama Desert"}'::jsonb, NULL, 'C', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '1-9', 9, 'mcq', 'More than 60% of journeys in Mexico City occur via public transit, but simply reproducing a feature of the city’s transit system—<u>e.g., its low fares</u>—is unlikely to induce a significant increase in another city’s transit ridership. As Erick Guerra et al. have shown, transportation mode choice in urban areas of Mexico is the product of a complex mix of factors, including population density, the spatial distribution of jobs, and demographic characteristics of individuals. System features do affect ridership, of course, but there is an irreducibly contextual dimension of transportation mode choice.', NULL, 'Which choice best describes the function of the underlined portion in the text as a whole?', '{"A":"It presents an objection to the argument of Guerra et al. about transportation mode choice in urban areas of Mexico.","B":"It explains why it is challenging to influence transit ridership solely by altering characteristics of a transit system.","C":"It illustrates the claim that a characteristic associated with high transit ridership in Mexico City is not associated with high transit ridership elsewhere.","D":"It substantiates the assertion that population density, the spatial distribution of jobs, and demographic characteristics are important factors in transportation mode choice."}'::jsonb, NULL, 'B', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '1-10', 10, 'mcq', 'Changes to vegetation cover and other human activities influence carbon and nitrogen levels in soil, though how deep these effects extend is unclear. Hypothesizing that differences in land use lead to differences in carbon and nitrogen levels that are not restricted to the topsoil layer (0–30 cm deep), Chukwuebuka Okolo and colleagues sampled soils across multiple land-use types (e.g., grazing land, cropland, forest) within each of several Ethiopian locations. They found, though, that across land-use types, carbon and nitrogen decreased to comparably low levels beyond depths of 30 cm.', NULL, 'Which choice best describes the overall structure of the text?', '{"A":"It describes a phenomenon that scientists do not fully understand, explains a research team’s hypothesis about that phenomenon, and then describes a finding that led the team to refine the hypothesis.","B":"It introduces an unresolved scientific question, presents a research team’s hypothesis pertaining to that question, and then describes an observation made by the team that conflicts with that hypothesis.","C":"It discusses a process that scientists are somewhat unclear about, introduces competing hypotheses about that process, and then explains how a research team concluded that one of those hypotheses is likely correct.","D":"It explains a hypothesis that has been the subject of scientific debate, discusses how a research team tested that hypothesis, and then presents data the team collected that validate the hypothesis."}'::jsonb, NULL, 'B', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '1-11', 11, 'mcq', 'Recently, scientists looked at data collected by NASA’s InSight lander to learn more about seismic activity on Mars, known as marsquakes. The data show that the marsquakes all started from the same location on the planet. This discovery was surprising to scientists, as they expected that the marsquakes would originate from all over the planet because of the cooling of the planet’s surface. Now, scientists believe that there could be areas of active magma flows deep beneath the planet’s surface that trigger the marsquakes.', NULL, 'According to the text, what was surprising to scientists studying the seismic activity data from NASA’s InSight lander?', '{"A":"The surface temperature of Mars has been rising.","B":"There were different types of seismic waves causing marsquakes.","C":"NASA’s InSight lander collected less data than scientists had expected.","D":"All the marsquakes started from the same location on the planet."}'::jsonb, NULL, 'D', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '1-12', 12, 'mcq', 'The ancient writing system used in the Maya kingdoms of southern Mexico and Central America had a symbol for the number zero. The earliest known example of the symbol dates to more than 2,000 years ago. At that time, almost none of the writing systems elsewhere in the world possessed a zero symbol. And the use of zero in Mexico and Central America may be even more ancient. Some historians suggest that Maya mathematicians inherited it from the Olmec civilization, which flourished in the region 2,400–3,600 years ago.', NULL, 'According to the text, what do some historians suggest about Maya civilization?', '{"A":"Maya civilization acquired the use of zero from the Olmec civilization.","B":"Maya civilization respected its historians more than it respected its mathematicians.","C":"Maya civilization was highly secretive about its intellectual achievements.","D":"Maya civilization tried to introduce its writing system to other civilizations."}'::jsonb, NULL, 'A', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '1-13', 13, 'mcq', '“The Bet” is an 1889 short story by Anton Chekhov. In the story, a banker is described as being very upset about something: ______', NULL, 'Which quotation from “The Bet” most effectively illustrates the claim?', '{"A":"“Then the banker cautiously broke the seals off the door and put the key in the keyhole.”","B":"“It struck three o’clock, the banker listened; everyone was asleep in the house and nothing could be heard outside but the rustling of the chilled trees.”","C":"“The banker, spoilt and frivolous, with millions beyond his reckoning, was delighted at the bet.”","D":"“When [the banker] got home he lay on his bed, but his tears and emotion kept him for hours from sleeping.”"}'::jsonb, NULL, 'D', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '1-14', 14, 'mcq', 'Partial List of Candidate Species for De-extinction
Common name | Scientific name | Became extinct
Huia | <i><i>Heteralocha</i> <i>acutirostris</i></i> | 1907
Caribbean monk seal | <i><i>Monachus</i> <i>tropicalis</i></i> | 1952
Passenger pigeon | <i><i>Ectopistes</i> <i>migratorius</i></i> | 1914
Saber-toothed cat | <i>Smilodon</i> | 11,000 years before present
Woolly mammoth | <i><i>Mammuthus</i> <i>primigenius</i></i> | 6,400 years before present

The passage of time is among the many obstacles faced by scientists who are pursuing de-extinction efforts—that is, efforts to use breeding or a mixture of cloning and genetic engineering to bring back extinct species. Specifically, researchers are concerned that the longer a species has been extinct, the less likely it is that a suitable habitat still exists for that species. Among candidate species for de-extinction, this problem would be especially concerning for the ______', NULL, 'Which choice most effectively uses data from the table to complete the statement?', '{"A":"passenger pigeon (<i><i>Ectopistes</i> <i>migratorius</i></i>), which became extinct only a few years after the huia (<i><i>Heteralocha</i> <i>acutirostris</i></i>).","B":"saber-toothed cat (<i>Smilodon</i>), which became extinct 11,000 years ago.","C":"woolly mammoth (<i><i>Mammuthus</i> <i>primigenius</i></i>), which became extinct several thousand years before the saber-toothed cat (<i>Smilodon</i>).","D":"Caribbean monk seal (<i><i>Monachus</i> <i>tropicalis</i></i>), which became extinct in 1952."}'::jsonb, NULL, 'B', NULL, NULL, 9)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '1-15', 15, 'mcq', '“The Yellow Wallpaper” is an 1892 short story by Charlotte Perkins Gilman. In the story, the narrator expresses mixed feelings about her surroundings: ______', NULL, 'Which quotation from “The Yellow Wallpaper” most effectively illustrates the claim?', '{"A":"“This wallpaper has a kind of sub-pattern in a different shade, a particularly irritating one, for you can only see it in certain lights, and not clearly then.”","B":"“By moonlight—the moon shines in all night when there is a moon—I wouldn’t know it was the same paper.”","C":"“I’m really getting quite fond of the big room, all but that horrid [wall]paper.”","D":"“The color is repellant, almost revolting; a smouldering, unclean yellow, strangely faded by the slow-turning sunlight.”"}'::jsonb, NULL, 'C', NULL, NULL, 9)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '1-16', 16, 'mcq', 'Ratio of Manganese to Calcium in Samples from Alboran Sea and Mauritanian Coast
[Line graph. X-axis: Approximate years before present (in thousands), from 2 to 20. Y-axis: Manganese to calcium ratio (arbitrary units), from 0 to 100. Two series are plotted: Alboran Sea and Mauritanian coast.]

The population of the coral <i>Lophelia pertusa</i> declined significantly around 9,000 years ago in the Alboran Sea and around 11,000 years ago near the Mauritanian coast. Using the ratio of manganese to calcium, which inversely correlates with ocean oxygenation levels, marine scientist Rodrigo da Costa Portilho-Ramos and colleagues evaluated whether oxygenation played a role in the declines of <i>L. pertusa</i>. The researchers concluded that oxygenation may have been important in the Alboran Sea but not near the Mauritanian coast, since ______', 'Line graph titled “Ratio of Manganese to Calcium in Samples from Alboran Sea and Mauritanian Coast.” X-axis: Approximate years before present (in thousands), values 2 to 20. Y-axis: manganese-to-calcium ratio, values 0 to 100. Two plotted series: Alboran Sea and Mauritanian coast.', 'Which choice most effectively uses data from the graph to complete the statement?', '{"A":"a substantial increase in oxygenation in the Alboran Sea corresponded with the local decline in <i>L. pertusa</i>, but the opposite relationship between oxygenation and <i>L. pertusa</i> was found near the Mauritanian coast.","B":"<i>L. pertusa</i> declined in the Alboran Sea during a period of substantial local decline in oxygenation, but <i>L. pertusa</i> declined near the Mauritanian coast during a period of little local change in oxygenation.","C":"oxygenation in the Alboran Sea was higher before the decline in <i>L. pertusa</i> than after the decline, whereas oxygenation near the Mauritanian coast was relatively low both before and after the decline in <i>L. pertusa</i>.","D":"oxygenation in the Alboran Sea tended to be substantially higher than oxygenation near the Mauritanian coast during the period studied."}'::jsonb, '/data/tests/cb-og-5/figures/m1-q16.png', 'B', NULL, NULL, 10)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '1-17', 17, 'mcq', 'The Younger Dryas was a period of extreme cooling from 11,700 to 12,900 years ago in the Northern Hemisphere. Some scientists argue that a comet fragment hitting Earth brought about the cooling. Others disagree, partly because there is no known crater from such an impact that dates to the beginning of the period. In 2015, a team led by Kurt Kjær detected a 19-mile-wide crater beneath a glacier in Greenland. The scientists who believe an impact caused the Younger Dryas claim that this discovery supports their view. However, Kjær’s team hasn’t yet been able to determine the age of the crater. Therefore, the team suggests that ______', NULL, 'Which choice most logically completes the text?', '{"A":"it can’t be concluded that the impact that made the crater was connected to the beginning of the Younger Dryas.","B":"it can’t be determined whether a comet fragment could make a crater as large as 19 miles wide.","C":"scientists have ignored the possibility that something other than a comet fragment could have made the crater.","D":"the scientists who believe an impact caused the Younger Dryas have made incorrect assumptions about when the period began."}'::jsonb, NULL, 'A', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '1-18', 18, 'mcq', 'In 2016 biological anthropologist Heather F. Smith and her team investigated the evolution of the appendix, an intestinal organ that is present in some mammals, including humans, but is generally thought to have no function. Studying 533 mammal species, the team found that the appendix has emerged independently across multiple lineages in separate instances and, significantly, hasn’t disappeared after emerging in specific lineages. Moreover, the team determined that species with the organ tend to have higher concentrations of lymphoid tissue, which supports immune responses, in the cecum, the organ the appendix is attached to. Therefore, the team hypothesized that the appendix likely ______', NULL, 'Which choice most logically completes the text?', '{"A":"was once present in many nonmammal species but has since disappeared from those lineages.","B":"has been preserved in certain mammal species because it benefits their immune systems.","C":"will emerge in a greater number of mammal species because it may serve a necessary function in the immune system.","D":"produced higher concentrations of lymphoid tissue in mammals in the past than it does currently."}'::jsonb, NULL, 'B', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '1-19', 19, 'mcq', 'Some ethicists hold that the moral goodness of an individual’s actions depends solely on whether the actions themselves are good, irrespective of the context in which they are carried out. Philosopher L. Sebastian Purcell has shown that surviving works of Aztec (Nahua) philosophy express a very different view. Purcell reveals that these works posit an ethical system in which an individual’s actions are judged in light of how well they accord with the individual’s role in society and how well they contribute to the community. To the extent that these works are representative of Aztec thought, Purcell’s analysis suggests that ______', NULL, 'Which choice most logically completes the text?', '{"A":"the Aztecs would have disputed the idea that the morality of an individual’s actions can be assessed by appealing to standards of behavior that are independent of the individual’s social circumstances.","B":"the Aztecs would not have accepted the notion that the morality of an individual’s actions can be fairly evaluated by people who do not live in the same society as that individual.","C":"actions by members of Aztec society who contributed a great deal to their community could be judged as morally good even if those actions were inconsistent with behaviors the Aztecs regarded as good in all contexts.","D":"similar actions performed by people in different social roles in Aztec society would have been regarded as morally equivalent unless those actions led to different outcomes for the community."}'::jsonb, NULL, 'A', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '1-20', 20, 'mcq', 'Lê Lương Minh became the thirteenth secretary-general of the Association of Southeast Asian Nations (ASEAN) in January 2013, making ______ the first time the organization would appoint a Vietnamese leader.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"these","B":"those","C":"this","D":"some"}'::jsonb, NULL, 'C', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '1-21', 21, 'mcq', 'In 1929, Edwin Herbert Land invented a polarizing filter that was featured in a number of products, from sunglasses to 3D movies. A decade later, Land ______ his technology to invent the world’s first instant camera, the Polaroid Land camera.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"used","B":"to have used","C":"to use","D":"using"}'::jsonb, NULL, 'A', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '1-22', 22, 'mcq', 'An online content creator who uses copyrighted songs without permission risks being demonetized (prohibited from including paid advertisements in content). The best way to avoid demonetization is to choose music from the public domain. Using one of these noncopyrighted songs ______ a creator won’t lose advertising revenue.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"are ensuring","B":"have ensured","C":"ensure","D":"ensures"}'::jsonb, NULL, 'D', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '1-23', 23, 'mcq', 'What makes the theremin a unique musical instrument? You play it without touching it. When you place your ______ the pitch will shift as your hands move through the air.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"hand’s between the two antenna’s,","B":"hands between the two antennas,","C":"hands’ between the two antennas’,","D":"hands’ between the two antennas,"}'::jsonb, NULL, 'B', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '1-24', 24, 'mcq', 'In the music video for the song “We Didn’t Start the Fire” by Billy Joel, the singer lists 118 political and cultural references. Such iconic references, cited in rapid and frenetic procession by the musician, who is seated impassively at a dinner table, ______ key moments and personalities of the twentieth century.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"represents","B":"has represented","C":"was representing","D":"represent"}'::jsonb, NULL, 'D', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '1-25', 25, 'mcq', 'Long attributed to Jacques-Louis David, the preeminent Neoclassical painter of his day, the 1801 painting Marie Joséphine Charlotte du Val d’Ognes gained fresh attention in the 1990s when art historians discovered that the painting—which depicts a solitary young woman sketching—was actually the work of little-known French portrait ______ Marie-Denise Villers (1774–1821).', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"artist—","B":"artist","C":"artist:","D":"artist,"}'::jsonb, NULL, 'B', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '1-26', 26, 'mcq', 'In 1986, conceptual artist Sophie Calle asked twenty-three people, all of whom had been born without sight, to describe “their image of beauty” in rich detail. Calle paired excerpts of these conversations with photographs—both of interviewees and the items they ______ to powerful effect in her exhibition <i>The Blind</i>.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"described, from hair to grass to sculptures","B":"described, from hair to grass to sculptures—","C":"described—from hair to grass to sculptures,","D":"described: from hair to grass to sculptures"}'::jsonb, NULL, 'B', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '1-27', 27, 'mcq', 'Celebrated Tewa potter Maria Martinez (1887–1980) made her signature all-black ceramic vessels using a heating technique called reduction firing. This technique involves smothering the flame surrounding the clay vessel. ______ the vessel takes on a shiny, black hue.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"On the contrary,","B":"For example,","C":"Previously,","D":"As a result,"}'::jsonb, NULL, 'D', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 28, '1-28', 28, 'mcq', 'Historians agree that the jazz pianist Jelly Roll Morton was exaggerating when he claimed to have invented jazz music. No one can deny, ______ that Morton’s innovative compositions and remarkable improvisational skills helped shape jazz as a genre during its early years.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"therefore,","B":"in the second place,","C":"in other words,","D":"though,"}'::jsonb, NULL, 'D', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 29, '1-29', 29, 'mcq', 'According to Duverger’s law, countries with single-ballot majoritarian elections for single-member districts tend to polarize into two-party systems, wherein dueling political parties consistently dominate the political system. ______ countries with proportional-representation electoral systems tend to support multi-partyism, under which power gets distributed among many political parties.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Subsequently,","B":"Conversely,","C":"For instance,","D":"In other words,"}'::jsonb, NULL, 'B', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 30, '1-30', 30, 'mcq', 'A turtle shell appears external to the animal, protecting its body like armor. ______ the shell is often incorrectly assumed to be an exoskeleton, a rigid outer casing like that of a crustacean or an insect, when in fact it is an endoskeleton, a part of the turtle’s internal bone structure, more akin to a spine or a pair of ribs.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"That being said,","B":"However,","C":"For instance,","D":"Hence,"}'::jsonb, NULL, 'D', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 31, '1-31', 31, 'mcq', 'While researching a topic, a student has taken the following notes:

• In 1859, the novel <i>Adam Bede</i> was published in England.
• According to the novel’s title page, the author’s name was George Eliot.
• George Eliot was widely assumed to be a pseudonym.
• A pseudonym is a fake name used to conceal an author’s identity.
• A woman named Mary Ann Evans later revealed herself as the novel’s real author.', NULL, 'The student wants to identify the real author of <i>Adam Bede</i>. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"The real author of <i>Adam Bede</i> was Mary Ann Evans, who published the novel using the pseudonym George Eliot.","B":"George Eliot, which <i>Adam Bede</i>’s title page indicated was the name of the novel’s author, was widely assumed to be a pseudonym.","C":"The title page of the novel <i>Adam Bede</i> indicated that the author’s name was George Eliot.","D":"A woman who had used a pseudonym to conceal her identity later revealed herself as the real author of <i>Adam Bede</i>."}'::jsonb, NULL, 'A', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 32, '1-32', 32, 'mcq', 'While researching a topic, a student has taken the following notes:

• Scientists have developed a “freeze-thaw” battery that can retain 92% of its charge after twelve weeks.
• The battery contains molten salt (a type of salt that liquifies when heated and solidifies at room temperature).
• When the salt is in a liquid state, energy flows through the battery.
• When the salt is in a solid state, energy stops flowing and is stored in the battery.
• The stored (frozen) energy can be used by reheating (thawing) the battery.', NULL, 'The student wants to specify how the salt enables energy storage. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Scientists have developed a freeze-thaw battery that contains molten salt, which liquifies when heated and solidifies at room temperature.","B":"The stored energy in a freeze-thaw battery, which contains molten salt, can be used by reheating the battery.","C":"When the molten salt in a freeze-thaw battery solidifies at room temperature, energy stops flowing and can be stored in the battery.","D":"Molten salt allows a freeze-thaw battery to retain 92% of its charge after twelve weeks."}'::jsonb, NULL, 'C', NULL, NULL, 16)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 33, '1-33', 33, 'mcq', 'While researching a topic, a student has taken the following notes:

• The US Fish and Wildlife Service (FWS) keeps a list of all at-risk species.
• Species on the list are classified as either endangered or threatened.
• A species that is in danger of extinction throughout most or all of its range is classified as endangered.
• A species that is likely to soon become endangered is classified as threatened.
• The California red-legged frog (<i>Rana draytonii</i>) is likely to soon become endangered, according to the FWS.', NULL, 'The student wants to indicate the California red-legged frog’s FWS classification category. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Species on the FWS list, which includes the California red-legged frog (<i>Rana draytonii</i>), are classified as either endangered or threatened.","B":"The California red-legged frog (<i>Rana draytonii</i>) appears on the FWS list of at-risk species.","C":"According to the FWS, the California red-legged frog is in the endangered category, in danger of extinction throughout most or all of its range.","D":"Likely to soon become endangered, the California red-legged frog is classified as threatened by the FWS."}'::jsonb, NULL, 'D', NULL, NULL, 16)
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
  VALUES (v_mod, 1, '2-1', 1, 'mcq', 'The following text is adapted from Elizabeth von Arnim''s 1922 novel <i>The Enchanted April</i>. Mrs. Wilkins and her friend Rose are traveling in Italy.

"I''m going to have one of these gorgeous oranges," said Mrs. Wilkins, staying where she was and reaching across to a black bowl piled with them. "Rose, how can you resist them. Look—have this one. Do have this beauty—" And she held out a big one.', NULL, 'As used in the text, what does the phrase "reaching across to" most nearly mean?', '{"A":"Joining with","B":"Gaining on","C":"Stretching toward","D":"Arriving at"}'::jsonb, NULL, 'C', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '2-2', 2, 'mcq', 'A team of paleontologists has found a rich fossil deposit near Gulgong, Australia. The fossils are so well preserved that the team has been able to ______ detailed information about the life forms that left them behind, such as color patterns and how they interacted with other species.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"occupy","B":"hoard","C":"reserve","D":"obtain"}'::jsonb, NULL, 'D', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '2-3', 3, 'mcq', 'According to a team of neuroeconomists from the University of Zurich, ease of decision making may be linked to communication between two brain regions, the prefrontal cortex and the parietal cortex. Individuals tend to be more decisive if the information flow between the regions is intensified, whereas they make choices more slowly when information flow is ______.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"reduced","B":"evaluated","C":"determined","D":"acquired"}'::jsonb, NULL, 'A', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '2-4', 4, 'mcq', 'The War of 1812 has ______ place in historical memory in Britain, partly because it is overshadowed by the much larger concurrent conflict against Napoleonic France and partly because it essentially maintained the geopolitical status quo for Britain: the country neither gained nor lost significant territory or position as a result of its participation in the war.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"a tenuous","B":"an enduring","C":"a contentious","D":"a conspicuous"}'::jsonb, NULL, 'A', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '2-5', 5, 'mcq', 'Claims about the original significance of Minoan bull-leaping rituals—depicted in paintings and sculptures from the second millennium BCE—are difficult to successfully ______. We know so little about the people archaeologists call the Minoans that assertions about what bull-leaping meant to them will almost inevitably rely on significant speculation and guesswork.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"imagine","B":"summarize","C":"defend","D":"adjust"}'::jsonb, NULL, 'C', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '2-6', 6, 'mcq', 'The following text is adapted from Jerome K. Jerome''s 1889 novel Three Men in a Boat (To Say Nothing of the Dog). The narrator is traveling by boat with Harris and another friend.

[Harris] told us anecdotes of how he had gone across the [English] Channel when it was so rough that the passengers had to be tied into their [beds], and he and the captain were the only two living souls on board who were not ill. Sometimes it was he and the second mate who were not ill; but it was generally he and one other man. <u>If not he and another man, then it was he by himself.</u>', NULL, 'Which choice best describes the function of the underlined sentence in the text as a whole?', '{"A":"It indicates the reason for Harris''s eagerness to resume traveling.","B":"It hints at Harris''s feeling that during an earlier boat trip, others didn''t include him in activities.","C":"It emphasizes that Harris always boasts about his own constitution when speaking of a previous boat trip.","D":"It reveals that although Harris claims to prefer solitary activities when traveling, he actually enjoys having company."}'::jsonb, NULL, 'C', NULL, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '2-7', 7, 'mcq', '<u>Several studies have found negligible electoral consequences for governments that impose fiscal austerity measures, yet some European governments recently suffered electorally due to their austerity programs.</u> Evelyne Huebscher and colleagues attribute this incongruity to governments'' tendency—not followed in the recent European cases—to implement austerity programs strategically to avoid electoral costs (e.g., setting spending cuts to take effect only after the next election), which has obscured the inherent political risks of austerity measures in the election data scholars have examined.', NULL, 'Which choice best describes the function of the underlined sentence in the text as a whole?', '{"A":"It explains a discrepancy between what has been observed in study settings and what has been observed in real-world settings that the text goes on to assert is attributable to the studies not using real-world data.","B":"It identifies a conflict between research findings and recent events that the text goes on to suggest is a consequence of a complicating factor in the data used to generate those findings.","C":"It presents a long-standing divergence in research findings that the text goes on to say is due to different groups of researchers using data that derive from different electoral circumstances.","D":"It describes a recent exception to a general pattern in research findings that the text goes on to explain is a result of researchers underestimating the significance of inconsistencies in the data they''ve analyzed."}'::jsonb, NULL, 'B', NULL, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '2-8', 8, 'mcq', 'Text 1
Graphic novels are increasingly popular in bookstores and libraries, but they shouldn''t be classified as literature. By definition, literature tells a story or conveys meaning through language only; graphic novels tell stories through illustrations and use language only sparingly, in captions and dialogue. Graphic novels are experienced as series of images and not as language, making them more similar to film than to literature.

Text 2
Graphic novels present their stories through both language and images. Without captions and dialogue, readers would be unable to understand what is depicted in the illustrations: the story results from the interaction of text and image. Moreover, Alison Bechdel''s <i>Fun Home</i> and many other graphic novels feature text that is as beautifully written as the prose found in many standard novels. Therefore, graphic novels qualify as literary texts.', NULL, 'Based on the texts, how would the author of Text 2 most likely respond to the overall argument presented in Text 1?', '{"A":"By asserting that language plays a more important role in graphic novels than the author of Text 1 recognizes","B":"By acknowledging that the author of Text 1 has identified a flaw that is common to all graphic novels","C":"By suggesting that the story lines of certain graphic novels are more difficult to understand than the author of Text 1 claims","D":"By agreeing with the author of Text 1 that most graphic novels aren''t as well crafted as most literary works are"}'::jsonb, NULL, 'A', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '2-9', 9, 'mcq', 'The following text is adapted from Ann Petry''s 1946 novel <i>The Street</i>. Lutie lives in an apartment in Harlem, New York.

The glow from the sunset was making the street radiant. The street is nice in this light, [Lutie] thought. It was swarming with children who were playing ball and darting back and forth across the sidewalk in complicated games of tag. Girls were skipping double dutch rope, going tirelessly through the exact center of a pair of ropes, jumping first on one foot and then the other.', NULL, 'Which choice best describes what is happening in the text?', '{"A":"Lutie is observing the appearance of the street at a particular time of day and the events occurring on it.","B":"Lutie is annoyed by the noise of children playing games on her street.","C":"Lutie is puzzled by the rules of certain children''s games.","D":"Lutie is spending time alone in her apartment because she doesn''t want to interact with her neighbors."}'::jsonb, NULL, 'A', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '2-10', 10, 'mcq', 'Since its completion in 2014, Bosco Verticale (Vertical Forest)—a pair of residential towers in Milan, Italy, covered by vegetation—has become a striking symbol of environmental sustainability in architecture. Stefano Boeri intended his design, which features balconies that are home to hundreds of trees, to serve as a model for promoting urban biodiversity. However, the concept has faced skepticism: critics note that although the trees used in Bosco Verticale were specifically cultivated for the project, it''s too early to tell if they can thrive in this unusual setting.', NULL, 'According to the text, why are some critics skeptical of the concept behind Bosco Verticale?', '{"A":"Some essential aspects of Bosco Verticale''s design are difficult to adapt to locations other than Milan.","B":"The plant life on Bosco Verticale ended up being less varied than Boeri had envisioned it would be.","C":"The construction of Bosco Verticale was no less environmentally damaging than the construction of more conventional buildings is.","D":"It is unclear whether Bosco Verticale can support the plant life included in its design."}'::jsonb, NULL, 'D', NULL, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '2-11', 11, 'mcq', 'Many literary theorists distinguish between <i>fabula</i>, a narrative''s content, and <i>syuzhet</i>, a narrative''s arrangement and presentation of events. In the film <i><i>The Godfather</i> <i>Part II</i></i>, the <i>fabula</i> is the story of the Corleone family, and the <i>syuzhet</i> is the presentation of the story as it alternates between two timelines in 1901 and 1958. But literary theorist Mikhail Bakhtin maintained that <i>fabula</i> and <i>syuzhet</i> are insufficient to completely describe a narrative—he held that systematic categorizations of artistic phenomena discount the subtle way in which meaning is created by interactions between the artist, the work, and the audience.', NULL, 'Which choice best states the main idea of the text?', '{"A":"Literary theorist Mikhail Bakhtin argued that there are important characteristics of narratives that are not fully encompassed by two concepts that other theorists have used to analyze narratives.","B":"Literary theorist Mikhail Bakhtin claimed that meaning is not inherent in a narrative but is created when an audience encounters a narrative so that narratives are interpreted differently by different people.","C":"The storytelling methods used in <i><i>The Godfather</i> <i>Part II</i></i> may seem unusually complicated, but they can be easily understood when two concepts from literary theory are utilized.","D":"Narratives that are told out of chronological order are more difficult for audiences to understand than are narratives presented chronologically."}'::jsonb, NULL, 'A', NULL, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '2-12', 12, 'mcq', 'Total Science Research Submissions by Topic, 2016–2019. A line graph shows the number of submissions (y-axis, 0 to 350) by year (x-axis, 2016 to 2019) for four topics: cellular and molecular biology, physics and space science, medicine and health, and animal science.

A student is researching the trends in the topics submitted to a national science fair for high school students. The graph shows the number of submissions by topic that were made each year. Based on the data in the graph, the student claims that <u>there were more medicine and health research topics submitted in 2019 than in any other year</u>.', 'Line graph titled "Total Science Research Submissions by Topic, 2016–2019"; y-axis Number of submissions (0–350), x-axis Year (2016–2019); four series: cellular and molecular biology, physics and space science, medicine and health, animal science.', 'Which choice most effectively uses data from the graph to support the underlined claim?', '{"A":"In 2016, the number of cellular and molecular biology topic submissions was the same as the number of animal science topic submissions.","B":"In 2019, there were more physics and space science topic submissions than there were medicine and health topic submissions.","C":"The lowest number of animal science topic submissions in a year was approximately 95 in 2016.","D":"The highest number of medicine and health topic submissions during the period shown is approximately 285 in 2019."}'::jsonb, '/data/tests/cb-og-5/figures/m2-q12.png', 'D', NULL, NULL, 23)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '2-13', 13, 'mcq', 'Fish whose DNA has been modified to include genetic material from other species are known as transgenic. Some transgenic fish have genes from jellyfish that result in fluorescence (that is, they glow in the dark). Although these fish were initially engineered for research purposes in the 1990s, they were sold as pets in the 2000s and can now be found in the wild in creeks in Brazil. A student in a biology seminar who is writing a paper on these fish asserts that their escape from Brazilian fish farms into the wild may have significant negative long-term ecological effects.', NULL, 'Which quotation from a researcher would best support the student''s assertion?', '{"A":"\"In one site in the wild where transgenic fish were observed, females outnumbered males, while in another the numbers of females and males were equivalent.\"","B":"\"Though some presence of transgenic fish in the wild has been recorded, there are insufficient studies of the impact of those fish on the ecosystems into which they are introduced.\"","C":"\"The ecosystems into which transgenic fish are known to have been introduced may represent a subset of the ecosystems into which the fish have actually been introduced.\"","D":"\"Through interbreeding, transgenic fish might introduce the trait of fluorescence into wild fish populations, making those populations more vulnerable to predators.\""}'::jsonb, NULL, 'D', NULL, NULL, 23)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '2-14', 14, 'mcq', 'Modeled Radial Growth of Sugar Maple Trees. A bar graph shows radial growth (y-axis, in mm, 0 to 0.25) under three climate scenarios (current climate, moderate change, extreme change), each with two bars: with nitrogen and without nitrogen.

Inés Ibáñez and colleagues studied a forest site in which some sugar maple trees receive periodic fertilization with nitrogen to mimic the broader trend of increasing anthropogenic nitrogen deposition in soil. Ibáñez and colleagues modeled the radial growth of the trees with and without nitrogen fertilization under three different climate scenarios (the current climate, moderate change, and extreme change). Although they found that climate change would negatively affect growth, they concluded that anthropogenic nitrogen deposition could more than offset that effect provided that change is moderate rather than extreme.', 'Bar graph titled "Modeled Radial Growth of Sugar Maple Trees"; y-axis Radial growth (millimeters per year), 0–0.25; x-axis Climate scenario (current climate, moderate change, extreme change); two bars per scenario: with nitrogen and without nitrogen.', 'Which choice best describes data from the graph that support Ibáñez and colleagues'' conclusion?', '{"A":"Growth with nitrogen under the current climate exceeded growth with nitrogen under moderate change, but the latter exceeded growth without nitrogen under extreme change.","B":"Growth without nitrogen under the current climate exceeded growth without nitrogen under moderate change, but the latter exceeded growth with nitrogen under extreme change.","C":"Growth with nitrogen under moderate change exceeded growth without nitrogen under moderate change, but the latter exceeded growth without nitrogen under extreme change.","D":"Growth with nitrogen under moderate change exceeded growth without nitrogen under the current climate, but the latter exceeded growth with nitrogen under extreme change."}'::jsonb, '/data/tests/cb-og-5/figures/m2-q14.png', 'D', NULL, NULL, 24)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '2-15', 15, 'mcq', '"Poetry" is a 1919 poem by Marianne Moore. The poem highlights an ambivalence toward poetry as the speaker acknowledges its merits while also expressing a sense of displeasure, writing ______', NULL, 'Which quotation from "Poetry" most effectively illustrates the claim?', '{"A":"\"nor is it valid / to discriminate against ''business documents and / school-books''; all these phenomena are important.\"","B":"\"One must make a distinction / however: when dragged into prominence by half poets, the result is not / poetry\"","C":"\"when [poems] become so derivative as to become unintelligible, the / same thing may be said for all of us—that we / do not admire what / we cannot understand.\"","D":"\"Reading [poetry], however, with a perfect contempt for it, one discovers that there is in / it after all, a place for the genuine.\""}'::jsonb, NULL, 'D', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '2-16', 16, 'mcq', 'Simulated Change in Annual Aquifer Input and Irrigation Output if Precipitation Concentration Increases as Climate Models Predict. Table columns: Baseline concentration of annual precipitation; % change in water entering aquifers; % change in surface water used for irrigation; % change in groundwater used for irrigation. Row 1: Precipitation is currently somewhat concentrated — 4.9 — 0.4 — 0.9. Row 2: Precipitation is currently evenly distributed — 11.0 — 9.0 — 7.9.

Some climate models for the western United States predict that while total annual precipitation may remain unchanged from the present level, precipitation will become concentrated into fewer but more intense rain and snow events. University of Texas climate scientist Geeta Persad and her colleagues simulated how the amount of water entering aquifers and the amount being used for irrigation purposes would change if this were to occur. Persad and her colleagues concluded that concentration of precipitation into fewer events would result in a higher number of dry days, triggering more irrigation, but that this change in irrigation output is highly sensitive to the baseline concentration of precipitation that currently exists in an area.', NULL, 'Which choice best describes data from the table that support Persad and her colleagues'' conclusion?', '{"A":"If baseline precipitation is somewhat concentrated, the amount of water being used for irrigation will increase 0.4% for surface water and 0.9% for groundwater, whereas the amount of water entering aquifers will increase 11.0% if baseline precipitation is evenly distributed.","B":"If baseline precipitation is somewhat concentrated, water use for irrigation will increase only slightly, whereas it will increase 9.0% for surface water and 7.9% for groundwater if baseline precipitation is evenly distributed.","C":"If baseline precipitation is somewhat concentrated, the amount of water entering aquifers will increase 4.9%, while the amount being used for irrigation will increase 0.4% for surface water and 0.9% for groundwater.","D":"If baseline precipitation is somewhat concentrated, water use for irrigation will decline by a small amount, whereas it will increase 11.0% for surface water and 9.0% for groundwater if baseline precipitation is evenly distributed."}'::jsonb, NULL, 'B', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '2-17', 17, 'mcq', 'In dialects of English spoken in Scotland, the "r" sound is strongly emphasized when it appears at the end of syllables (as in "car") or before other consonant sounds (as in "bird"). English dialects of the Upland South, a region stretching from Oklahoma to western Virginia, place similar emphasis on "r" at the ends of syllables and before other consonant sounds. Historical records show that the Upland South was colonized largely by people whose ancestors came from Scotland. Thus, linguists have concluded that ______', NULL, 'Which choice most logically completes the text?', '{"A":"the English dialects spoken in the Upland South acquired their emphasis on the \"r\" sound from dialects spoken in Scotland.","B":"emphasis on the \"r\" sound will eventually spread from English dialects spoken in the Upland South to dialects spoken elsewhere.","C":"the English dialects spoken in Scotland were influenced by dialects spoken in the Upland South.","D":"people from Scotland abandoned their emphasis on the \"r\" sound after relocating to the Upland South."}'::jsonb, NULL, 'A', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '2-18', 18, 'mcq', 'How did whales, once no bigger than seals, evolve to become the largest animals on Earth? Brazilian biologist Mariana Nery believes the answer might be found in whales'' DNA. In January 2023, Nery and her colleagues ______ a study showing changes over time in four whale genes associated with body size.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"published","B":"publishing","C":"having published","D":"to publish"}'::jsonb, NULL, 'A', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '2-19', 19, 'mcq', 'A harpsichord may look just like a piano, but the difference between the two instruments is easy to hear. When a harpsichord''s keys are pressed, the strings inside the ______ are plucked, not struck.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"instrument:","B":"instrument","C":"instrument—","D":"instrument,"}'::jsonb, NULL, 'B', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '2-20', 20, 'mcq', 'When they were first introduced to western Europe from Byzantium in the eleventh century, table forks were met with much resistance. The Bishop of Ostia, St. Peter Damian, condemned the eating utensils because he considered ______ dangerous and unnecessary luxury items.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"them","B":"this","C":"that","D":"it"}'::jsonb, NULL, 'A', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '2-21', 21, 'mcq', 'Julia Alvarez''s 1994 novel <i>In the Time of the</i> <i>Butterflies</i>, a fictionalized account of the lives of the Mirabal ______ can serve as a starting point for those wanting to explore how the rule of dictator Rafael Trujillo has been represented in Dominican American literature.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"sisters, and","B":"sisters and","C":"sisters,","D":"sisters"}'::jsonb, NULL, 'C', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '2-22', 22, 'mcq', 'On March 23, 2021, a gust of wind wreaked havoc on global trade. <i>Ever Given</i>, an international shipping container vessel, became lodged in Egypt''s Suez Canal, a major shipping route between Europe and Asia. The vessel took six days to ______ it''s as heavy as two thousand blue whales when fully loaded.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"dislodge in part due to its sheer size,","B":"dislodge, in part due to its sheer size:","C":"dislodge, in part due to its sheer size,","D":"dislodge, in part, due to its sheer size"}'::jsonb, NULL, 'B', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '2-23', 23, 'mcq', 'Fans of the film Moana (2016) may not know that the deep and humorous voice behind the ______ belongs to comedian, actor, and musician Jemaine Clement. The versatile performer has appeared in everything from television commercials to action movies, but voice acting, specifically, has become a notable part of his career.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"character Tamatoa the crab","B":"character Tamatoa the crab,","C":"character: Tamatoa the crab,","D":"character, Tamatoa the crab"}'::jsonb, NULL, 'A', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '2-24', 24, 'mcq', 'In her 1983 book <i>The Managed Heart</i>: <i>Commercialization of Human Feeling</i>, sociologist Arlie Russell Hochschild first explored at length her conception of a "sociology of emotions"—the idea that the various cultural and ideological frameworks a person has internalized (class, gender, political affiliation, etc.) ______ each emotional reaction that person has within a situation.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"underlies","B":"is underlying","C":"underlie","D":"has been underlying"}'::jsonb, NULL, 'C', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '2-25', 25, 'mcq', 'American abstract artist Richard ______ his installations to make passersby keenly aware of how one''s movements are affected by the physical features of one''s environment, assembles large-scale steel plates into sculptures that dominate the outdoor spaces they occupy.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"Serra is intending","B":"Serra, intends","C":"Serra, intending","D":"Serra intends"}'::jsonb, NULL, 'C', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '2-26', 26, 'mcq', 'In 1949, Frank Zamboni developed an ice rink resurfacing machine. As Zamboni''s machine moved along the rink''s surface, it first scraped off the top layer of ice. ______ it sprayed water into the deep grooves left behind by customers'' skates. Lastly, it smoothed over the newly formed ice.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"For example,","B":"Next,","C":"Similarly,","D":"In contrast,"}'::jsonb, NULL, 'B', NULL, NULL, 29)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '2-27', 27, 'mcq', 'In 2014, Nestor Gomez won his first-ever storytelling competition, relating a tale about his life as a Guatemalan immigrant living in Chicago. ______ in 2017, Gomez created the show <i>80 Minutes Around</i> <i>the World</i> as a platform for others to share stories about their immigration experiences.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Instead,","B":"For example,","C":"Later,","D":"In other words,"}'::jsonb, NULL, 'C', NULL, NULL, 29)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 28, '2-28', 28, 'mcq', 'To guarantee the validity of experimental results, scientists rely on precise, unchanging standards of measurement. ______ metrologists (scientists who study measurement) developed the SI, or International System of Units. The SI''s units of measurement are based on unchanging values in nature, such as the mass of an electron or the speed of light.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"In contrast,","B":"Regardless,","C":"In addition,","D":"For this reason,"}'::jsonb, NULL, 'D', NULL, NULL, 29)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 29, '2-29', 29, 'mcq', 'In retrospect, one of the lessons of the 2003 Human Genome Project is that a gene is affected by many factors, not the least of which is its interactions with the protein products of other genes. ______ rather than just focusing on the human genome, efforts to better understand gene mutations related to disease have begun to consider the human proteome, the complete set of proteins expressed by human genes.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"In other words,","B":"That said,","C":"For example,","D":"Accordingly,"}'::jsonb, NULL, 'D', NULL, NULL, 29)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 30, '2-30', 30, 'mcq', 'While researching a topic, a student has taken the following notes:
• Iranian scholar Abu Rayhan al-Biruni studied Earth''s physical features.
• He theorized that a large landmass existed west of Europe and east of Asia.
• Al-Biruni published his landmass theory in 1037 CE.

The student wants to specify when al-Biruni published his landmass theory.', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"In 1037 CE, al-Biruni published his theory that a large landmass existed west of Europe and east of Asia.","B":"Al-Biruni, who studied Earth''s physical features, published a theory about a large landmass.","C":"Al-Biruni was an Iranian scholar who studied Earth''s physical features.","D":"An Iranian scholar who studied Earth''s physical features, al-Biruni theorized that a large landmass existed west of Europe and east of Asia."}'::jsonb, NULL, 'A', NULL, NULL, 30)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 31, '2-31', 31, 'mcq', 'While researching a topic, a student has taken the following notes:
• In astronomy, the mass of stars can be described in units called solar masses.
• One solar mass is roughly equal to the mass of the Sun.
• The mass of the star Proxima Centauri is 0.122 solar masses.
• The mass of the star Sirius A is 2.063 solar masses.

The student wants to emphasize the mass of Sirius A.', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"The mass of stars, like Proxima Centauri, can be described in units called solar masses.","B":"In astronomy, the mass of stars can be described in units called solar masses, and one solar mass is roughly equal to the mass of the Sun.","C":"The Sun is more massive than Proxima Centauri, which has a mass of 0.122 solar masses.","D":"With a mass of 2.063 solar masses, Sirius A is more massive than the Sun."}'::jsonb, NULL, 'D', NULL, NULL, 30)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 32, '2-32', 32, 'mcq', 'While researching a topic, a student has taken the following notes:
• A lever is a simple machine consisting of a rigid beam and a fulcrum.
• The fulcrum is the point about which the beam pivots.
• The input force (effort) is the force applied to the lever.
• The output force (load) is the force that the lever exerts on another object.
• In first-class levers, the fulcrum is located between the effort and the load.
• In second-class levers, the load is located between the effort and the fulcrum.

The student wants to contrast first-class levers and second-class levers.', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"In levers, the effort is the force applied to the lever; the load, in contrast, is the force that the lever exerts on another object.","B":"In first-class and second-class levers, the fulcrum and the load are in different locations.","C":"First-class levers are simple machines consisting of a rigid beam and a fulcrum, but then again, the same is true of second-class levers.","D":"In first-class levers, the fulcrum is located between the effort and the load, but in second-class levers, the load is located between the effort and the fulcrum."}'::jsonb, NULL, 'D', NULL, NULL, 31)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 33, '2-33', 33, 'mcq', 'While researching a topic, a student has taken the following notes:
• Earthquakes start at a point called a "focus" and spread out from there as seismic waves.
• The two types of seismic waves that travel beneath Earth''s surface are primary waves (P waves) and secondary waves (S waves).
• P waves travel more quickly beneath Earth''s surface than do S waves.
• P waves compress and expand the ground, causing it to move backward and forward.
• S waves cause the ground to move from side to side.

The student wants to emphasize a similarity between P waves and S waves.', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"P waves and S waves both travel beneath Earth''s surface, causing the ground to move.","B":"P waves travel away from an earthquake''s starting point at a higher rate of speed than do S waves.","C":"Spreading out from the focus of an earthquake, P waves move the ground backward and forward.","D":"Although P waves and S waves start at the same point, they behave very differently."}'::jsonb, NULL, 'A', NULL, NULL, 31)
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
  VALUES (v_mod, 1, '3-1', 1, 'mcq', NULL, 'An xy-plane with grid, x-axis labeled from -2 to 9 and y-axis labeled from -2 to 9, origin O. A curved (nonlinear) graph starts at about (-2, 4), is nearly horizontal near y = 4, then curves upward to the right passing through about (5, 5) and rising steeply. A straight line passes from upper left, descending steeply through about (3, 9) down through (4, 5) and continuing to about (5, -2). The two graphs intersect at the point (4, 5).', 'The graph of a system of a linear equation and a nonlinear equation is shown. What is the solution $(x, y)$ to this system?', '{"A":"$(0, 0)$","B":"$(0, 4)$","C":"$(4, 5)$","D":"$(5, 0)$"}'::jsonb, '/data/tests/cb-og-5/figures/m3-q1.png', 'C', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '3-2', 2, 'mcq', NULL, NULL, 'On the first day of a semester, a film club has 90 members. Each day after the first day of the semester, 10 new members join the film club. If no members leave the film club, how many total members will the film club have 4 days after the first day of the semester?', '{"A":"400","B":"130","C":"94","D":"90"}'::jsonb, NULL, 'B', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '3-3', 3, 'mcq', NULL, 'An xy-plane with grid, x-axis labeled from -2 to 14 (by 2s) and y-axis labeled from -1 to 8, origin O. A straight line with negative slope passes through about (0, 8) on the y-axis and descends to the right, crossing the x-axis at about x = 5.5 and continuing downward to about (7, -1).', 'The graph of the linear function $f$ is shown, where $y = f(x)$. What is the $y$-intercept of the graph of $f$ ?', '{"A":"$(0, 0)$","B":"$\\left(0, -\\frac{16}{11}\\right)$","C":"$(0, -8)$","D":"$(0, 8)$"}'::jsonb, '/data/tests/cb-og-5/figures/m3-q3.png', 'D', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '3-4', 4, 'mcq', '$$s + 7r = 27$$
$$r = 3$$', NULL, 'What is the solution $(r, s)$ to the given system of equations?', '{"A":"$(6, 3)$","B":"$(3, 6)$","C":"$(3, 27)$","D":"$(27, 3)$"}'::jsonb, NULL, 'B', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '3-5', 5, 'mcq', 'The table shows selected values from function $f$.

| $x$ | $f(x)$ |
| --- | --- |
| $-1$ | 16 |
| 0 | 17 |
| 1 | 18 |
| 2 | 19 |', NULL, 'Which of the following is the best description of function $f$ ?', '{"A":"Decreasing linear","B":"Increasing linear","C":"Decreasing exponential","D":"Increasing exponential"}'::jsonb, NULL, 'B', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '3-6', 6, 'grid', NULL, 'An xy-plane with grid, x-axis labeled from -1 to 9 and y-axis labeled from -2 to 5, origin O. Two straight lines are shown. One line has positive slope rising from lower left (about (2, -2)) up to the right through about (6, 5). The other line has negative slope descending from upper left (about (2, 5)) down to the right through about (6, -2). The two lines intersect at about (4, 1).', 'The graph of a system of linear equations is shown. The solution to the system is $(x, y)$. What is the value of $x$ ?', NULL, '/data/tests/cb-og-5/figures/m3-q6.png', '4', '["4"]'::jsonb, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '3-7', 7, 'grid', '$$23, 27, 27, 32, 35, 36, 52$$', NULL, 'What is the range of the 7 scores shown?', NULL, NULL, '29', '["29"]'::jsonb, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '3-8', 8, 'mcq', NULL, 'A transversal line k crosses two parallel lines m and n (m above n). Line k descends from upper right to lower left, crossing line m and then line n. At the intersection of line k with line m, an angle of 145° is marked (interior, to the lower-left of the intersection). An angle x° is associated with the intersection at line n. Note: Figure not drawn to scale.', 'In the figure, line $m$ is parallel to line $n$, and line $k$ intersects both lines. Which of the following statements is true?', '{"A":"The value of $x$ is less than 145.","B":"The value of $x$ is greater than 145.","C":"The value of $x$ is equal to 145.","D":"The value of $x$ cannot be determined."}'::jsonb, '/data/tests/cb-og-5/figures/m3-q8.png', 'C', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '3-9', 9, 'mcq', NULL, NULL, 'The equation $x + y = 1{,}440$ represents the number of minutes of daylight (between sunrise and sunset), $x$, and the number of minutes of non-daylight, $y$, on a particular day in Oak Park, Illinois. If this day has 670 minutes of daylight, how many minutes of non-daylight does it have?', '{"A":"670","B":"770","C":"1,373","D":"1,440"}'::jsonb, NULL, 'B', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '3-10', 10, 'mcq', NULL, NULL, 'Scott selected 20 employees at random from all 400 employees at a company. He found that 16 of the employees in this sample are enrolled in exactly three professional development courses this year. Based on Scott''s findings, which of the following is the best estimate of the number of employees at the company who are enrolled in exactly three professional development courses this year?', '{"A":"4","B":"320","C":"380","D":"384"}'::jsonb, NULL, 'B', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '3-11', 11, 'mcq', NULL, NULL, 'If $4x - 28 = -24$, what is the value of $x - 7$ ?', '{"A":"$-24$","B":"$-22$","C":"$-6$","D":"$-1$"}'::jsonb, NULL, 'C', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '3-12', 12, 'mcq', NULL, NULL, 'For a snowstorm in a certain town, the minimum rate of snowfall recorded was 0.6 inches per hour, and the maximum rate of snowfall recorded was 1.8 inches per hour. Which inequality is true for all values of $s$, where $s$ represents a rate of snowfall, in inches per hour, recorded for this snowstorm?', '{"A":"$s \\geq 2.4$","B":"$s \\geq 1.8$","C":"$0 \\leq s \\leq 0.6$","D":"$0.6 \\leq s \\leq 1.8$"}'::jsonb, NULL, 'D', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '3-13', 13, 'grid', '$$y = 4x$$
$$y = x^2 - 12$$', NULL, 'A solution to the given system of equations is $(x, y)$, where $x > 0$. What is the value of $x$ ?', NULL, NULL, '6', '["6"]'::jsonb, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '3-14', 14, 'grid', NULL, NULL, 'A store sells two different-sized containers of blueberries. The store''s sales of these blueberries totaled 896.86 dollars last month. The equation $4.51x + 6.07y = 896.86$ represents this situation, where $x$ is the number of smaller containers sold and $y$ is the number of larger containers sold. According to the equation, what is the price, in dollars, of each smaller container?', NULL, NULL, '4.51', '["4.51","451/100"]'::jsonb, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '3-15', 15, 'mcq', NULL, NULL, 'A right circular cylinder has a base diameter of 22 centimeters and a height of 6 centimeters. What is the volume, in cubic centimeters, of the cylinder?', '{"A":"$132\\pi$","B":"$264\\pi$","C":"$726\\pi$","D":"$2{,}904\\pi$"}'::jsonb, NULL, 'C', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '3-16', 16, 'mcq', NULL, 'The given graph: an xy-plane with grid, x-axis labeled to 10 (by 2s) and y-axis labeled from -4 to 12 (by 2s), origin O. The curve of f starts very high near (0, 12), drops steeply, passing through about (2, 3), and decreases gradually approaching a horizontal asymptote at about y = 1 for large x (x >= 0). Answer choices A-D each show an xy-plane with the same axes (x to 10, y from -4 to 12), showing different downward-curving rational graphs with different horizontal asymptotes: A approaches about y = -4, B approaches about y = 0, C approaches about y = 1, D approaches about y = 6.', 'The graph of the rational function $f$ is shown, where $y = f(x)$ and $x \geq 0$. Which of the following is the graph of $y = f(x) + 5$, where $x \geq 0$ ?', '{"A":"A graph in which the curve starts near (0, 12), drops steeply, crosses the x-axis near x = 2, and decreases toward an asymptote at about y = -4 for large x.","B":"A graph in which the curve starts near (0, 11), drops steeply, and decreases toward an asymptote at about y = 0 (the x-axis) for large x.","C":"A graph in which the curve starts near (0, 12), drops steeply, and decreases toward an asymptote at about y = 1 for large x.","D":"A graph in which the curve starts near (0, 12), decreases more gradually, and approaches an asymptote at about y = 6 for large x."}'::jsonb, '/data/tests/cb-og-5/figures/m3-q16.png', 'D', NULL, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '3-17', 17, 'mcq', NULL, NULL, 'At a particular track meet, the ratio of coaches to athletes is 1 to 26. If there are $x$ coaches at the track meet, which of the following expressions represents the number of athletes at the track meet?', '{"A":"$\\dfrac{x}{26}$","B":"$26x$","C":"$x + 26$","D":"$\\dfrac{26}{x}$"}'::jsonb, NULL, 'B', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '3-18', 18, 'mcq', NULL, NULL, 'Kaylani used fabric measuring 5 yards in length to make each suit for a men''s choir. The relationship between the number of suits that Kaylani made, $x$, and the total length of fabric that she purchased $y$, in yards, is represented by the equation $y - 5x = 6$. What is the best interpretation of 6 in this context?', '{"A":"Kaylani made 6 suits.","B":"Kaylani purchased a total of 6 yards of fabric.","C":"Kaylani used a total of 6 yards of fabric to make the suits.","D":"Kaylani purchased 6 yards more fabric than she used to make the suits."}'::jsonb, NULL, 'D', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '3-19', 19, 'mcq', NULL, NULL, 'What is the value of $\tan\dfrac{92\pi}{3}$ ?', '{"A":"$-\\sqrt{3}$","B":"$-\\dfrac{\\sqrt{3}}{3}$","C":"$\\dfrac{\\sqrt{3}}{3}$","D":"$\\sqrt{3}$"}'::jsonb, NULL, 'A', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '3-20', 20, 'grid', NULL, 'A right triangle. The right angle is at the bottom-left vertex. The vertical left leg has length 11. The hypotenuse, going from the top vertex down to the bottom-right vertex, has length 28. The angle x° is marked at the top vertex (between the vertical leg of length 11 and the hypotenuse of length 28). Note: Figure not drawn to scale.', 'In the triangle shown, what is the value of $\cos x°$ ?', NULL, '/data/tests/cb-og-5/figures/m3-q20.png', '.3928', '[".3928",".3929","11/28"]'::jsonb, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '3-21', 21, 'grid', NULL, NULL, 'The function $g$ is defined by $g(x) = (x + 14)(t - x)$, where $t$ is a constant. In the $xy$-plane, the graph of $y = g(x)$ passes through the point $(24, 0)$. What is the value of $g(0)$ ?', NULL, NULL, '336', '["336"]'::jsonb, NULL, 40)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '3-22', 22, 'mcq', '$$(x + 4)^2 + (y - 19)^2 = 121$$', NULL, 'The graph of the given equation is a circle in the $xy$-plane. The point $(a, b)$ lies on the circle. Which of the following is a possible value for $a$ ?', '{"A":"$-16$","B":"$-14$","C":"11","D":"19"}'::jsonb, NULL, 'B', NULL, NULL, 40)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '3-23', 23, 'mcq', NULL, NULL, 'A right rectangular prism has a height of 9 inches. The length of the prism''s base is $x$ inches, which is 7 inches more than the width of the prism''s base. Which function $V$ gives the volume of the prism, in cubic inches, in terms of the length of the prism''s base?', '{"A":"$V(x) = x(x + 9)(x + 7)$","B":"$V(x) = x(x + 9)(x - 7)$","C":"$V(x) = 9x(x + 7)$","D":"$V(x) = 9x(x - 7)$"}'::jsonb, NULL, 'D', NULL, NULL, 40)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '3-24', 24, 'mcq', NULL, NULL, 'Which of the following functions has(have) a minimum value at $-3$ ?

$\text{I. } f(x) = -6(3)^x - 3$

$\text{II. } g(x) = -3(6)^x$', '{"A":"I only","B":"II only","C":"I and II","D":"Neither I nor II"}'::jsonb, NULL, 'D', NULL, NULL, 40)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '3-25', 25, 'mcq', NULL, NULL, 'The result of increasing the quantity $x$ by 400% is 60. What is the value of $x$ ?', '{"A":"12","B":"15","C":"240","D":"340"}'::jsonb, NULL, 'A', NULL, NULL, 41)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '3-26', 26, 'mcq', NULL, NULL, 'The function $f$ is defined by $f(x) = ax^2 + bx + c$, where $a$, $b$, and $c$ are constants. The graph of $y = f(x)$ in the $xy$-plane passes through the points $(7, 0)$ and $(-3, 0)$. If $a$ is an integer greater than 1, which of the following could be the value of $a + b$ ?', '{"A":"$-6$","B":"$-3$","C":"4","D":"5"}'::jsonb, NULL, 'A', NULL, NULL, 41)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '3-27', 27, 'grid', NULL, NULL, 'The function $g$ is defined by $g(x) = x(x - 2)(x + 6)^2$. The value of $g(7 - w)$ is 0, where $w$ is a constant. What is the sum of all possible values of $w$ ?', NULL, NULL, '25', '["25"]'::jsonb, NULL, 41)
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
  VALUES (v_mod, 1, '4-1', 1, 'mcq', NULL, NULL, 'What is 20% of 440?', '{"A":"44","B":"88","C":"880","D":"1,760"}'::jsonb, NULL, 'B', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '4-2', 2, 'mcq', 'Argon is placed inside a container with a constant volume. The graph shows the estimated pressure $y$, in pounds per square inch (psi), of the argon when its temperature is $x$ kelvins.', 'Line graph in the xy-plane. The horizontal axis is labeled "Temperature (kelvins)" with gridlines at 100, 200, 300, 400, 500, 600, 700, and 800. The vertical axis is labeled $y$ with marked values 6, 12, 18, 24, 30, and 36 (pressure in psi). A straight line rises from near the origin, passing through approximately (100, 6) and (200, 12), increasing steadily so that at $x = 600$ the line is at $y = 36$.', 'What is the estimated pressure of the argon, in psi, when the temperature is 600 kelvins?', '{"A":"6","B":"12","C":"300","D":"600"}'::jsonb, '/data/tests/cb-og-5/figures/m4-q2.png', 'B', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '4-3', 3, 'mcq', NULL, NULL, 'The function $f$ is defined by $f(x) = 4x - 3$. What is the value of $f(10)$ ?', '{"A":"$-30$","B":"37","C":"40","D":"43"}'::jsonb, NULL, 'B', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '4-4', 4, 'mcq', NULL, NULL, 'Which expression is equivalent to $16x^3y^2 + 14xy$ ?', '{"A":"$2xy(8xy + 7)$","B":"$2xy(8x^2y + 7)$","C":"$14xy(2x^2y + 1)$","D":"$14xy(8x^2y + 1)$"}'::jsonb, NULL, 'B', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '4-5', 5, 'mcq', NULL, NULL, 'A veterinarian recommends that each day a certain rabbit should eat 25 calories per pound of the rabbit''s weight, plus an additional 11 calories. Which equation represents this situation, where $c$ is the total number of calories the veterinarian recommends the rabbit should eat each day if the rabbit''s weight is $x$ pounds?', '{"A":"$c = 25x$","B":"$c = 36x$","C":"$c = 11x + 25$","D":"$c = 25x + 11$"}'::jsonb, NULL, 'D', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '4-6', 6, 'grid', NULL, NULL, 'If $6n = 12$, what is the value of $n + 4$ ?', NULL, NULL, '6', '["6"]'::jsonb, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '4-7', 7, 'grid', NULL, NULL, '$(d - 30)(d + 30) - 7 = -7$
What is a solution to the given equation?', NULL, NULL, '30', '["30","-30"]'::jsonb, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '4-8', 8, 'mcq', NULL, NULL, 'Line $r$ in the $xy$-plane has a slope of 4 and passes through the point $(0, 6)$. Which equation defines line $r$ ?', '{"A":"$y = -6x + 4$","B":"$y = 6x + 4$","C":"$y = 4x - 6$","D":"$y = 4x + 6$"}'::jsonb, NULL, 'D', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '4-9', 9, 'mcq', 'A competitive diver dives from a platform into the water. The graph shown gives the height above the water $y$, in meters, of the diver $x$ seconds after diving from the platform.', 'Curve in the xy-plane. The horizontal axis is labeled "Time (seconds)" with gridlines at 1, 2, and 3; the vertical axis is labeled "Height (meters)" with $y$ marked at 3, 6, 9, and 12. The curve starts at about (0, 10), rises slightly to a maximum near 10 meters at about $x = 0.2$, then curves downward and decreases, crossing the x-axis (height 0) at about $x = 1.6$ seconds.', 'What is the best interpretation of the $x$-intercept of the graph?', '{"A":"The diver reaches a maximum height above the water at 1.6 seconds.","B":"The diver hits the water at 1.6 seconds.","C":"The diver reaches a maximum height above the water at 0.2 seconds.","D":"The diver hits the water at 0.2 seconds."}'::jsonb, '/data/tests/cb-og-5/figures/m4-q9.png', 'B', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '4-10', 10, 'mcq', NULL, NULL, 'The kinetic energy, in joules, of an object with mass 9 kilograms traveling at a speed of $v$ meters per second is given by the function $K$, where $K(v) = \frac{9}{2}v^2$. Which of the following is the best interpretation of $K(34) = 5{,}202$ in this context?', '{"A":"The object traveling at 34 meters per second has a kinetic energy of 5,202 joules.","B":"The object traveling at 340 meters per second has a kinetic energy of 5,202 joules.","C":"The object traveling at 5,202 meters per second has a kinetic energy of 34 joules.","D":"The object traveling at 23,409 meters per second has a kinetic energy of 34 joules."}'::jsonb, NULL, 'A', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '4-11', 11, 'mcq', 'The scatterplot shows the relationship between two variables $x$ and $y$. A line of best fit for the data is also shown.', 'Scatterplot in the first quadrant. Both axes range from about 1 to 10, with the vertical axis labeled $y$ and the horizontal axis labeled $x$. Ten data points are plotted in a generally increasing pattern, and a straight upward-sloping line of best fit passes through the cluster of points. Some points lie above the line and some below it; the question asks how many points lie above the line of best fit.', 'For how many of the 10 data points is the actual $y$-value greater than the $y$-value predicted by the line of best fit?', '{"A":"3","B":"4","C":"6","D":"7"}'::jsonb, '/data/tests/cb-og-5/figures/m4-q11.png', 'C', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '4-12', 12, 'mcq', NULL, NULL, 'At a movie theater, there are a total of 350 customers. Each customer is located in either theater A, theater B, or theater C. If one of these customers is selected at random, the probability of selecting a customer who is located in theater A is 0.48, and the probability of selecting a customer who is located in theater B is 0.24. How many customers are located in theater C?', '{"A":"28","B":"40","C":"84","D":"98"}'::jsonb, NULL, 'D', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '4-13', 13, 'grid', NULL, NULL, 'What is the slope of the graph of $y = \frac{1}{3}(29x + 10) + 5x$ in the $xy$-plane?', NULL, NULL, '14.66', '["14.66","14.67","44/3"]'::jsonb, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '4-14', 14, 'grid', NULL, NULL, 'The length of each edge of a box is 29 inches. Each side of the box is in the shape of a square. The box does not have a lid. What is the exterior surface area, in square inches, of this box without a lid?', NULL, NULL, '4205', '["4205"]'::jsonb, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '4-15', 15, 'mcq', 'Five <i>Eretmochelys imbricata</i>, a type of sea turtle, each have a nest. The table shows an original data set of the number of eggs that each turtle laid in its nest. The table has columns "Nest" and "Number of eggs" with rows: A, 149; B, 144; C, 148; D, 136; E, 139.', NULL, 'A sixth nest with 121 eggs is added to create a new data set. Which of the following correctly compares the means of the two data sets?', '{"A":"The mean of the original data set is greater than the mean of the new data set.","B":"The mean of the original data set is less than the mean of the new data set.","C":"The means of both data sets are equal.","D":"There is not enough information to compare the means."}'::jsonb, NULL, 'A', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '4-16', 16, 'mcq', NULL, NULL, 'In $\triangle RST$, the measure of $\angle R$ is $63°$. Which of the following could be the measure, in degrees, of $\angle S$ ?', '{"A":"116","B":"118","C":"126","D":"180"}'::jsonb, NULL, 'A', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '4-17', 17, 'mcq', NULL, NULL, 'Which expression is equivalent to $(8x^3 + 8) - (x^3 - 2)$ ?', '{"A":"$8x^3 + 6$","B":"$7x^3 + 10$","C":"$8x^3 + 10$","D":"$7x^3 + 6$"}'::jsonb, NULL, 'B', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '4-18', 18, 'mcq', NULL, NULL, 'If $4\sqrt{2x} = 16$, what is the value of $6x$ ?', '{"A":"24","B":"48","C":"72","D":"96"}'::jsonb, NULL, 'B', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '4-19', 19, 'mcq', NULL, NULL, '$2x - y > 883$
For which of the following tables are all the values of $x$ and their corresponding values of $y$ solutions to the given inequality?', '{"A":"Table with columns $x$, $y$: (440, 0), (441, $-2$), (442, $-4$).","B":"Table with columns $x$, $y$: (440, 0), (442, $-2$), (441, $-4$).","C":"Table with columns $x$, $y$: (442, 0), (440, $-2$), (441, $-4$).","D":"Table with columns $x$, $y$: (442, 0), (441, $-2$), (440, $-4$)."}'::jsonb, NULL, 'D', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '4-20', 20, 'grid', NULL, NULL, '$5y = 10x + 11$
$-5y = 5x - 21$
The solution to the given system of equations is $(x, y)$. What is the value of $30x$ ?', NULL, NULL, '20', '["20"]'::jsonb, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '4-21', 21, 'grid', NULL, NULL, 'A rectangle is inscribed in a circle, such that each vertex of the rectangle lies on the circumference of the circle. The diagonal of the rectangle is twice the length of the shortest side of the rectangle. The area of the rectangle is $1{,}089\sqrt{3}$ square units. What is the length, in units, of the diameter of the circle?', NULL, NULL, '66', '["66"]'::jsonb, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '4-22', 22, 'mcq', NULL, NULL, 'Rectangles $ABCD$ and $EFGH$ are similar. The length of each side of $EFGH$ is 6 times the length of the corresponding side of $ABCD$. The area of $ABCD$ is 54 square units. What is the area, in square units, of $EFGH$?', '{"A":"9","B":"36","C":"324","D":"1,944"}'::jsonb, NULL, 'D', NULL, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '4-23', 23, 'mcq', NULL, NULL, 'Which expression is equivalent to $\frac{42a}{k} + 42ak$, where $k > 0$ ?', '{"A":"$\\frac{84a}{k}$","B":"$\\frac{84ak^2}{k}$","C":"$\\frac{42a(k + 1)}{k}$","D":"$\\frac{42a(k^2 + 1)}{k}$"}'::jsonb, NULL, 'D', NULL, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '4-24', 24, 'mcq', NULL, NULL, 'Which quadratic equation has no real solutions?', '{"A":"$x^2 + 14x - 49 = 0$","B":"$x^2 - 14x + 49 = 0$","C":"$5x^2 - 14x - 49 = 0$","D":"$5x^2 - 14x + 49 = 0$"}'::jsonb, NULL, 'D', NULL, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '4-25', 25, 'mcq', NULL, NULL, '$P(t) = 260(1.04)^{\left(\frac{6}{4}\right)t}$
The function $P$ models the population, in thousands, of a certain city $t$ years after 2003. According to the model, the population is predicted to increase by 4% every $n$ months. What is the value of $n$ ?', '{"A":"8","B":"12","C":"18","D":"72"}'::jsonb, NULL, 'A', NULL, NULL, 50)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '4-26', 26, 'mcq', NULL, NULL, 'A circle in the $xy$-plane has its center at $(-1, 1)$. Line $t$ is tangent to this circle at the point $(5, -4)$. Which of the following points also lies on line $t$ ?', '{"A":"$\\left(0, \\frac{6}{5}\\right)$","B":"$(4, 7)$","C":"$(10, 2)$","D":"$(11, 1)$"}'::jsonb, NULL, 'C', NULL, NULL, 50)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '4-27', 27, 'grid', NULL, NULL, 'For an electric field passing through a flat surface perpendicular to it, the electric flux of the electric field through the surface is the product of the electric field''s strength and the area of the surface. A certain flat surface consists of two adjacent squares, where the side length, in meters, of the larger square is 3 times the side length, in meters, of the smaller square. An electric field with strength 29.00 volts per meter passes uniformly through this surface, which is perpendicular to the electric field. If the total electric flux of the electric field through this surface is $4{,}640$ volts $\cdot$ meters, what is the electric flux, in volts $\cdot$ meters, of the electric field through the larger square?', NULL, NULL, '4176', '["4176"]'::jsonb, NULL, 50)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
END $seed$;
