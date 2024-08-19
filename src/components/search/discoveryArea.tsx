import { useEffect, useState, useRef, use, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { SolrObject } from "meta/interface/SolrObject";
import { Grid, Typography } from "@mui/material";
import { useQueryState, parseAsBoolean, parseAsString } from "nuqs";
import SolrQueryBuilder from "./helper/SolrQueryBuilder";
import SuggestedResult from "./helper/SuggestedResultBuilder";
import { generateSolrParentList } from "meta/helper/solrObjects";
import { filterResults } from "./helper/FilterHelpMethods";
import CheckBoxObject from "./interface/CheckboxObject";
import DetailPanel from "./detailPanel/detailPanel";
import SearchRow from "./searchArea/searchRow";
import ResultsPanel from "./resultsPanel/resultsPanel";
import { SearchUIConfig } from "../searchUIConfig";
import MapPanel from "./mapPanel/mapPanel";
import { GetAllParams } from "./helper/ParameterList";
import { findSolrAttribute } from "meta/helper/util";
import FilterPanel, { grouped } from "./filterPanel/filterPanel";
export default function DiscoveryArea({
  results,
  isLoading,
  filterAttributeList,
  schema,
}: {
  results: SolrObject[];
  isLoading: boolean;
  filterAttributeList: {
    attribute: string;
    displayName: string;
  }[];
  schema: {};
}): JSX.Element {
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [autocompleteKey, setAutocompleteKey] = useState(0);
  const initialSearchInput = useQueryState("query", parseAsString)[0];
  const [inputValue, setInputValue] = useState<string>(initialSearchInput);
  const [value, setValue] = useState<string | null>(initialSearchInput);
  const [checkboxes, setCheckboxes] = useState([]);
  let tempSRChecboxes = new Set<CheckBoxObject>();
  SearchUIConfig.search.searchBox.spatialResOptions.forEach((option) => {
    tempSRChecboxes.add({
      attribute: "special_resolution", // not sure where this attribute property is used?
      value: option.value,
      checked: searchParams.get("layers")
        ? searchParams.get("layers").toString().includes(option.value)
        : false,
      displayName: option.display_name,
    });
  });
  const [options, setOptions] = useState([]);
  const [resetStatus, setResetStatus] = useState(true);

  let searchQueryBuilder = useMemo(() => new SolrQueryBuilder(), []);
  searchQueryBuilder.setSchema(schema);
  let suggestResultBuilder = useMemo(() => new SuggestedResult(), []);

  /**
   * ***************
   * Helper functions
   */
  const handleSearch = async (value) => {
    searchQueryBuilder
      .fetchResult()
      .then((result) => {
        processResults(result, value);
        console.log("suggestResultBuilder", suggestResultBuilder.getTerms());
        // if multiple terms are returned, we get all weight = 1 terms (this is done in SuggestionsResultBuilder), then aggregate the results for all terms
        if (suggestResultBuilder.getTerms().length > 0) {
          const multipleResults = [] as SolrObject[];
          suggestResultBuilder.getTerms().forEach((term) => {
            searchQueryBuilder.combineQueries(term, filterQueries);
            searchQueryBuilder.fetchResult().then((result) => {
              generateSolrParentList(result, sortBy, sortOrder).forEach(
                (parent) => {
                  multipleResults.push(parent);
                }
              );
              // remove duplicates by id
              const newResults = Array.from(
                new Set(multipleResults.map((a) => a.id))
              ).map((id) => {
                return multipleResults.find((a) => a.id === id);
              });
              setOriginalResults(newResults);
              setFetchResults(newResults);
            });
          });
        } else {
          console.log("no suggestions, just one term", value, filterQueries);
          searchQueryBuilder.combineQueries(value, filterQueries);
          searchQueryBuilder.fetchResult().then((result) => {
            const newResults = generateSolrParentList(
              result,
              sortBy,
              sortOrder
            );
            setOriginalResults(newResults);
            setFetchResults(newResults);
          });
        }
      })
      .catch((error) => {
        console.error("Error fetching result:", error);
      });
  };
  const processResults = (results, value) => {
    suggestResultBuilder.setSuggester("mySuggester"); //this could be changed to a different suggester
    suggestResultBuilder.setSuggestInput(value);
    suggestResultBuilder.setResultTerms(JSON.stringify(results));
  };
  // Run filter and sort only if no query is present or searchInputBox is set to no value
  // NOTE that sort is handled by generateSolrParentList instead of query directly to Solr so that when the parentList is generated (as displayed), the result is sorted
  const noQuery = () => {
    const shouldSort =
      (
        sortOrder.length > 0 &&
        sortBy.length > 0 &&
        findSolrAttribute(sortBy, searchQueryBuilder.getSchema() !== undefined)
      ).length > 0;
    if (filterQueries.length > 0) {
      searchQueryBuilder.filterQuery(filterQueries);
      searchQueryBuilder
        .fetchResult()
        .then((result) => {
          const newResults = shouldSort
            ? generateSolrParentList(result, sortBy, sortOrder)
            : generateSolrParentList(result);
          setFetchResults(newResults);
        })
        .catch((error) => {
          console.error("Error fetching result:", error);
        });
    }
  };

  /**
   * ***************
   * URL Parameter Handling
   */
  const {
    showDetailPanel,
    showFilter,
    setShowFilter,
    sortOrder,
    setSortOrder,
    sortBy,
    setSortBy,
    resourceType,
    setResourceType,
    resourceClass,
    setResourceClass,
    format,
    setFormat,
    indexYear,
    setIndexYear,
    query,
    setQuery,
  } = GetAllParams();
  const isQuery = query.length > 0;
  const reGetFilterQueries = (res) => {
    if (resourceType) {
      resourceType.split(",").forEach((r) => {
        res.push({
          attribute: "resource_type",
          value: r,
        });
      });
    }
    if (resourceClass) {
      resourceClass.split(",").forEach((r) => {
        res.push({
          attribute: "resource_class",
          value: r,
        });
      });
    }
    if (format) {
      format.split(",").forEach((f) => {
        res.push({ attribute: "format", value: f });
      });
    }
    if (indexYear) {
      indexYear.split(",").forEach((i) => {
        res.push({ attribute: "index_year", value: i });
      });
    }
    return res;
  };
  const filterQueries = reGetFilterQueries([]); //should i change this to useState?

  const [fetchResults, setFetchResults] = useState<SolrObject[]>(
    generateSolrParentList(results, sortBy, sortOrder)
  );
  const [originalResults, setOriginalResults] =
    useState<SolrObject[]>(fetchResults); // last step, probably move this to memory in the future

  /**
   * ***************
   * Filter & Sort Component
   */
  const updateAll = (newSortBy, newSortOrder, newFilterQueries, searchTerm) => {
    setSortBy(newSortBy ? newSortBy : null);
    setSortOrder(newSortOrder ? newSortOrder : null);
    setResourceType(null);
    setResourceClass(null);
    setFormat(null);
    setIndexYear(null);
    newFilterQueries.forEach((filter) => {
      if (filter.attribute === "resource_class") {
        setResourceClass((prev) =>
          prev ? `${prev},${filter.value}` : filter.value
        );
      }
      if (filter.attribute === "format") {
        setFormat((prev) => (prev ? `${prev},${filter.value}` : filter.value));
      }
      if (filter.attribute === "index_year") {
        setIndexYear((prev) =>
          prev ? `${prev},${filter.value}` : filter.value
        );
      }
    });
    if (searchTerm) {
      setQuery(searchTerm);
    }
  };
  const filterComponent = (
    <FilterPanel
      reGetFilterQueries={reGetFilterQueries}
      originalList={originalResults}
      term={isQuery ? query : "*"}
      optionMaxNum={7}
      filterQueries={filterQueries}
      showFilter={showFilter ? showFilter : ""}
      setShowFilter={setShowFilter}
      sortOrder={sortOrder ? sortOrder : ""}
      setSortOrder={setSortOrder}
      sortBy={sortBy ? sortBy : ""}
      setSortBy={setSortBy}
      handleSearch={handleSearch}
      updateAll={updateAll}
    />
  );

  /**
   * ***************
   * Query & Search Input handling
   */
  const handleInputReset = () => {
    setAutocompleteKey((prevKey) => prevKey + 1);
    setCheckboxes([]);
    setOptions([]);
    setValue(null);
    setInputValue("");
    setResetStatus(true);
    // since only input got reset, we need to re-run the filter
    noQuery();
  };
  // const [newQueryString, setNewQueryString] = useQueryState(
  //   "query",
  //   parseAsString
  // );
  // const [queryString, setQueryString] = useState(newQueryString);
  // useEffect(() => {
  //   if (newQueryString && newQueryString !== queryString) {
  //     setQueryString(newQueryString);
  //   }
  // }, [newQueryString, queryString]);
  // Run `suggestQuery` first, then `handleSearch`
  useEffect(() => {
    handleSearch(query !== undefined ? query : "*");
  }, [
    sortBy,
    sortOrder,
    resourceType,
    resourceClass,
    format,
    indexYear,
    query,
  ]);
  // useEffect(() => {
  //   if (queryString) {
  //     searchQueryBuilder.suggestQuery(queryString);
  //     handleSearch(queryString);
  //   } else {
  //     if (query.length === 0 || inputValue === null) noQuery();
  //     else handleSearch(query);
  //   }
  // }, [queryString, inputValue]);

  return (
    <Grid container>
      <Grid item xs={12}>
        <SearchRow
          header={SearchUIConfig.search.headerRow.title}
          description={SearchUIConfig.search.headerRow.subtitle}
          schema={schema}
          autocompleteKey={autocompleteKey}
          options={options}
          setOptions={setOptions}
          handleInputReset={handleInputReset}
          inputValue={inputValue}
          setInputValue={setInputValue}
          value={value}
          setValue={setValue}
          inputRef={inputRef}
          handleSearch={handleSearch}
        />
      </Grid>
      {fetchResults.length > 0 && (
        <Grid item className="sm:px-[2em]" xs={12} sm={4}>
          <ResultsPanel
            resultsList={fetchResults}
            relatedList={fetchResults}
            isQuery={isQuery || filterQueries.length > 0}
            filterComponent={filterComponent}
            showFilter={showFilter}
            setShowFilter={setShowFilter}
          />
        </Grid>
      )}
      {fetchResults.length > 0 ? (
        <Grid item xs={8} className="sm:ml-[0.5em]">
          <Grid
            item
            className="sm:px-[2em]"
            xs={12}
            sx={{ display: showDetailPanel[0].length == 0 ? "block" : "none" }}
          >
            <MapPanel resultsList={fetchResults} />
          </Grid>
          <Grid
            sx={{ display: showDetailPanel[0].length > 0 ? "block" : "none" }}
          >
            <DetailPanel
              resultItem={fetchResults.find((r) => r.id === showDetailPanel[0])}
            />
          </Grid>
        </Grid>
      ) : isLoading ? (
        <Grid item xs={7}>
          {" "}
          <h1>Loading map...</h1>
        </Grid>
      ) : (
        <Grid item xs={7}>
          <h1>No results.</h1>
        </Grid>
      )}
    </Grid>
  );
}
